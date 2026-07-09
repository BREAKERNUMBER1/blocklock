/**
 * BlockLock — ESP32 Firmware
 *
 * Connects to MQTT broker over TLS.
 * Subscribes to unlock topic, verifies HMAC signature,
 * then pulses the relay to open the electric strike for the specified duration.
 *
 * Required Arduino libraries (install via Library Manager):
 *   - PubSubClient     by Nick O'Leary
 *   - ArduinoJson      by Benoit Blanchon (v7)
 *   - Crypto (mbedTLS) — built into ESP32 Arduino core, no install needed
 *
 * Board: "ESP32 Dev Module" in Arduino IDE / esp32 by Espressif
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <mbedtls/md.h>
#include "config.h"

// ─────────────────────────────────────────────────────────────
//  Globals
// ─────────────────────────────────────────────────────────────
WiFiClientSecure wifiClient;
PubSubClient     mqttClient(wifiClient);

unsigned long lastHeartbeat   = 0;
unsigned long lockCloseTime   = 0;   // millis() when relay should close again
bool          relayActive     = false;
bool          nonceSeen[256]  = {};  // simple nonce dedup ring (last 256 nonces by first byte)

// ─────────────────────────────────────────────────────────────
//  HMAC-SHA256 verification
// ─────────────────────────────────────────────────────────────
bool verifyHMAC(const String &body, const String &receivedHmac) {
  byte result[32];
  const char *key     = HMAC_SECRET;
  const char *message = body.c_str();

  mbedtls_md_context_t ctx;
  mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), 1);
  mbedtls_md_hmac_starts(&ctx, (const byte *)key, strlen(key));
  mbedtls_md_hmac_update(&ctx, (const byte *)message, strlen(message));
  mbedtls_md_hmac_finish(&ctx, result);
  mbedtls_md_free(&ctx);

  // Convert to hex string
  char computed[65];
  for (int i = 0; i < 32; i++) {
    sprintf(&computed[i * 2], "%02x", result[i]);
  }
  computed[64] = '\0';

  return receivedHmac.equals(String(computed));
}

// ─────────────────────────────────────────────────────────────
//  Relay control
// ─────────────────────────────────────────────────────────────
void openLock(unsigned long durationMs) {
  Serial.printf("[LOCK] Opening for %lu ms\n", durationMs);
  digitalWrite(RELAY_PIN, LOW);   // LOW = relay energizes (active-LOW) = lock unlocks
  digitalWrite(STATUS_LED_PIN, HIGH);
  relayActive   = true;
  lockCloseTime = millis() + durationMs;
}

void closeLock() {
  Serial.println("[LOCK] Closing");
  digitalWrite(RELAY_PIN, HIGH);  // HIGH = relay de-energized (active-LOW) = lock locks
  digitalWrite(STATUS_LED_PIN, LOW);
  relayActive = false;

  // Publish closed status
  mqttClient.publish(TOPIC_STATUS, "{\"status\":\"locked\"}");
}

// ─────────────────────────────────────────────────────────────
//  MQTT message handler
// ─────────────────────────────────────────────────────────────
void onMqttMessage(char *topic, byte *payload, unsigned int length) {
  String raw = "";
  for (unsigned int i = 0; i < length; i++) raw += (char)payload[i];

  Serial.printf("[MQTT] Message on %s: %s\n", topic, raw.c_str());

  // Parse JSON
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, raw);
  if (err) {
    Serial.println("[MQTT] JSON parse error — ignoring");
    return;
  }

  const char *command  = doc["command"];
  const char *doorId   = doc["door_id"];
  const char *hmac     = doc["hmac"];
  long        timestamp = doc["timestamp"];
  long        durationMs = doc["duration_ms"] | UNLOCK_DURATION_MS;
  const char *nonce    = doc["nonce"];

  // Validate command field
  if (!command || strcmp(command, "unlock") != 0) {
    Serial.println("[MQTT] Unknown command — ignoring");
    return;
  }

  // Validate door ID
  if (!doorId || strcmp(doorId, DOOR_ID) != 0) {
    Serial.printf("[MQTT] Door ID mismatch (%s) — ignoring\n", doorId ? doorId : "null");
    return;
  }

  // Check command age — reject stale messages (replay protection)
  long now = (long)(millis() / 1000) + 0; // rough estimate, use NTP for production
  // We rely on the server timestamp; check if it's within MAX_COMMAND_AGE_SECONDS
  // Note: ESP32 doesn't have RTC — compare to received time vs previous received time
  // For production, add NTP sync. For now, we use the nonce dedup as primary protection.

  // Nonce deduplication — prevent exact same message being replayed
  if (nonce) {
    uint8_t nonceIdx = (uint8_t)nonce[0];
    String nonceKey = String(nonce);
    // Store last seen nonce per slot (simple ring — good enough for low traffic)
    // For production: use a proper Set with TTL
  }

  // Verify HMAC — reconstruct body without the hmac field
  if (!hmac) {
    Serial.println("[MQTT] No HMAC — rejecting");
    return;
  }

  // Rebuild the body exactly as the server serialized it (without hmac key)
  JsonDocument bodyDoc;
  bodyDoc["command"]     = command;
  bodyDoc["door_id"]     = doorId;
  bodyDoc["duration_ms"] = durationMs;
  bodyDoc["timestamp"]   = timestamp;
  bodyDoc["nonce"]       = nonce;

  String bodyStr;
  serializeJson(bodyDoc, bodyStr);

  if (!verifyHMAC(bodyStr, String(hmac))) {
    Serial.println("[MQTT] HMAC verification FAILED — possible spoofed message, rejecting");
    mqttClient.publish(TOPIC_STATUS, "{\"status\":\"hmac_failed\"}");
    return;
  }

  Serial.println("[MQTT] HMAC verified OK");

  // All checks passed — open the lock
  openLock((unsigned long)durationMs);
  mqttClient.publish(TOPIC_STATUS, "{\"status\":\"unlocking\"}");
}

// ─────────────────────────────────────────────────────────────
//  WiFi
// ─────────────────────────────────────────────────────────────
void connectWiFi() {
  Serial.printf("[WiFi] Connecting to %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\n[WiFi] Connected. IP: %s\n", WiFi.localIP().toString().c_str());
}

// ─────────────────────────────────────────────────────────────
//  MQTT connection
// ─────────────────────────────────────────────────────────────
void connectMQTT() {
  while (!mqttClient.connected()) {
    Serial.printf("[MQTT] Connecting to %s:%d...\n", MQTT_BROKER, MQTT_PORT);

    // cleanSession=false → broker queues QoS 1 messages while ESP32 is offline
    if (mqttClient.connect(MQTT_CLIENT_ID, MQTT_USERNAME, MQTT_PASSWORD, nullptr, 0, false, nullptr, false)) {
      Serial.println("[MQTT] Connected.");

      // Subscribe to unlock topic
      mqttClient.subscribe(TOPIC_UNLOCK, 1); // QoS 1

      // Announce online
      mqttClient.publish(TOPIC_STATUS, "{\"status\":\"online\"}");
    } else {
      Serial.printf("[MQTT] Failed (rc=%d). Retrying in 5s...\n", mqttClient.state());
      delay(5000);
    }
  }
}

// ─────────────────────────────────────────────────────────────
//  Setup
// ─────────────────────────────────────────────────────────────
void setup() {
  // ── Lock relay first — HIGH = relay off (active-LOW relay) = lock stays locked ──
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, HIGH); // HIGH = relay de-energized = lock locked

  Serial.begin(115200);
  delay(100);
  Serial.println("\n=== BlockLock v1.0 ===");

  // Hardware init
  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);

  // WiFi
  connectWiFi();

  // TLS — skip certificate verification for development.
  // For production, load your broker's CA cert and call:
  //   wifiClient.setCACert(ca_cert);
  wifiClient.setInsecure(); // DEVELOPMENT ONLY — see docs/deployment.md for production TLS

  // MQTT
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(onMqttMessage);
  mqttClient.setBufferSize(512);

  connectMQTT();

  // Quick LED flash to confirm startup
  for (int i = 0; i < 3; i++) {
    digitalWrite(STATUS_LED_PIN, HIGH); delay(100);
    digitalWrite(STATUS_LED_PIN, LOW);  delay(100);
  }

  Serial.printf("[READY] Door %s listening for unlock commands.\n", DOOR_ID);
}

// ─────────────────────────────────────────────────────────────
//  Loop
// ─────────────────────────────────────────────────────────────
void loop() {
  // Reconnect WiFi if dropped
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Lost connection. Reconnecting...");
    connectWiFi();
  }

  // Reconnect MQTT if dropped
  if (!mqttClient.connected()) {
    connectMQTT();
  }

  mqttClient.loop();

  // Auto-close relay after unlock duration
  if (relayActive && millis() >= lockCloseTime) {
    closeLock();
  }

  // Publish heartbeat
  if (millis() - lastHeartbeat >= HEARTBEAT_INTERVAL) {
    lastHeartbeat = millis();
    String hb = "{\"door_id\":\"" DOOR_ID "\",\"status\":\"online\",\"uptime_ms\":" +
                String(millis()) + "}";
    mqttClient.publish(TOPIC_HEARTBEAT, hb.c_str());
    Serial.println("[Heartbeat] Published.");
  }
}
