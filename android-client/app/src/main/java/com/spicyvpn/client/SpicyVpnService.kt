package com.spicyvpn.client

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.util.Base64
import android.widget.Toast
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.URL

class SpicyVpnService : VpnService() {

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val sublink = intent?.getStringExtra("sublink") ?: return START_NOT_STICKY

        startForeground(1, createNotification("Connecting SpicyVPN..."))

        CoroutineScope(Dispatchers.IO).launch {
            try {
                // 1. Fetch and Parse Sublink (Identical to Electron logic)
                val response = URL(sublink).readText()
                val decodedPayload = String(Base64.decode(response.trim(), Base64.DEFAULT))
                val hysteriaUrl = decodedPayload.trim().split("\n").firstOrNull { it.startsWith("hysteria2://") }
                    ?: throw Exception("No hysteria2 link found in sublink payload.")

                val cleanUrl = hysteriaUrl.replace("hysteria2://", "")
                val uuid = cleanUrl.substringBefore("@")
                val addressPart = cleanUrl.substringAfter("@").substringBefore("?")
                val server = addressPart.substringBefore(":")
                val serverPort = addressPart.substringAfter(":").toInt()
                val queryParams = cleanUrl.substringAfter("?").split("&")
                
                var sni = ""
                var insecure = false

                for (param in queryParams) {
                    val pair = param.split("=")
                    if (pair.size == 2) {
                        when (pair[0]) {
                            "sni" -> sni = pair[1]
                            "insecure" -> insecure = pair[1] == "1"
                        }
                    }
                }

                // 2. Generate Sing-box JSON Config
                val config = JSONObject()

                val log = JSONObject().apply { put("level", "info") }
                config.put("log", log)

                // DNS
                val dns = JSONObject().apply {
                    put("servers", JSONArray().apply {
                        put(JSONObject().apply { put("tag", "google").put("address", "8.8.8.8").put("detour", "direct") })
                        put(JSONObject().apply { put("tag", "local").put("address", "local") })
                    })
                    put("rules", JSONArray().apply {
                        put(JSONObject().apply { put("outbound", "any").put("server", "local").put("disable_cache", true) })
                        put(JSONObject().apply { put("outbound", "any").put("server", "google") })
                    })
                }
                config.put("dns", dns)

                // Inbounds (TUN Interface configured by libbox)
                val inbounds = JSONArray().apply {
                    put(JSONObject().apply {
                        put("type", "tun")
                        put("tag", "tun-in")
                        // Leave interface_name out or "spicy-tun" for libbox mobile auto-handling
                        put("address", JSONArray().apply { put("172.19.0.1/30") })
                        put("auto_route", true)
                        put("strict_route", true)
                        put("stack", "system") // Android loves system stack vs gvisor
                        put("sniff", true)
                        put("sniff_override_destination", true)
                    })
                }
                config.put("inbounds", inbounds)

                // Outbounds (Hysteria2)
                val outbounds = JSONArray().apply {
                    put(JSONObject().apply {
                        put("type", "hysteria2")
                        put("tag", "proxy")
                        put("server", server)
                        put("server_port", serverPort)
                        put("password", uuid)
                        put("tls", JSONObject().apply {
                            put("enabled", true)
                            put("server_name", sni)
                            put("insecure", insecure)
                        })
                        put("up_mbps", 100)
                        put("down_mbps", 100)
                    })
                    put(JSONObject().apply { put("type", "direct").put("tag", "direct") })
                    put(JSONObject().apply { put("type", "dns").put("tag", "dns-out") })
                }
                config.put("outbounds", outbounds)

                val route = JSONObject().apply {
                    put("rules", JSONArray().apply {
                        put(JSONObject().apply { put("protocol", "dns").put("outbound", "dns-out") })
                        put(JSONObject().apply { put("ip_is_private", true).put("outbound", "direct") })
                    })
                    put("auto_detect_interface", true)
                }
                config.put("route", route)

                val finalJsonString = config.toString(2)

                // 3. Inform system we are about to start a VPN
                val builder = Builder()
                    .setSession("SpicyVPN")
                    .setMtu(1500)
                    .addAddress("172.19.0.1", 30) // Match the inbound config
                    .addRoute("0.0.0.0", 0) // Route everything through TUN
                    
                val vpnInterface = builder.establish() ?: throw Exception("Failed to establish VpnService")
                val fd = vpnInterface.fd

                // 4. In a real environment, you pass the `finalJsonString` config and the `fd` (FileDescriptor)
                // directly into the `libbox.Box` android wrapper layer here!
                // e.g., libbox.Libbox.startBox(finalJsonString, fd)
                
                withContext(Dispatchers.Main) {
                    Toast.makeText(this@SpicyVpnService, "Connected (Config Gen Success!)", Toast.LENGTH_LONG).show()
                }

            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(this@SpicyVpnService, "Connection Failed: ${e.message}", Toast.LENGTH_LONG).show()
                }
                stopSelf()
            }
        }

        return START_STICKY
    }

    private fun createNotification(message: String): android.app.Notification {
        val channelId = "spicy_vpn_channel"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(channelId, "SpicyVPN Status", NotificationManager.IMPORTANCE_LOW)
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
        return NotificationCompat.Builder(this, channelId)
            .setContentTitle("SpicyVPN")
            .setContentText(message)
            .setSmallIcon(android.R.drawable.ic_secure)
            .setOngoing(true)
            .build()
    }

    override fun onDestroy() {
        super.onDestroy()
        // libbox.Libbox.stopBox() -> Cleanup TUN
    }
}
