package com.spicyvpn.client

import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

class MainActivity : ComponentActivity() {

    private var sublink by mutableStateOf("")

    // Launcher for the VpnService preparation intent
    private val vpnLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == RESULT_OK) {
            startVpnService()
        } else {
            Toast.makeText(this, "VPN Permission Denied", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        val sharedPrefs = getSharedPreferences("SpicyVPN", Context.MODE_PRIVATE)
        sublink = sharedPrefs.getString("sublink", "") ?: ""

        setContent {
            SpicyVPNTheme {
                MainScreen(
                    sublink = sublink,
                    onSublinkChange = { 
                        sublink = it
                        sharedPrefs.edit().putString("sublink", it).apply()
                    },
                    onConnectClick = { handleConnectClick() }
                )
            }
        }
    }

    private fun handleConnectClick() {
        if (sublink.isBlank() || !sublink.startsWith("http")) {
            Toast.makeText(this, "Please enter a valid SpicyVPN sublink", Toast.LENGTH_SHORT).show()
            return
        }

        val intent = VpnService.prepare(this)
        if (intent != null) {
            vpnLauncher.launch(intent)
        } else {
            // Already prepared
            startVpnService()
        }
    }

    private fun startVpnService() {
        val serviceIntent = Intent(this, SpicyVpnService::class.java).apply {
            putExtra("sublink", sublink)
        }
        startService(serviceIntent)
        Toast.makeText(this, "Connecting...", Toast.LENGTH_SHORT).show()
    }
}

// ----------------------------------------------------
// Compose UI
// ----------------------------------------------------

@Composable
fun SpicyVPNTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            background = Color.Black,
            surface = Color.Black
        ),
        content = content
    )
}

@Composable
fun MainScreen(
    sublink: String,
    onSublinkChange: (String) -> Unit,
    onConnectClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
    ) {
        // Dithered Background Decoration
        Canvas(modifier = Modifier.fillMaxSize()) {
            val step = 4f
            for (x in 0 until size.width.toInt() step step.toInt()) {
                for (y in 0 until size.height.toInt() step step.toInt()) {
                    if ((x / step.toInt() + y / step.toInt()) % 2 == 0) {
                        drawRect(
                            color = Color.White.copy(alpha = 0.03f),
                            topLeft = Offset(x.toFloat(), y.toFloat()),
                            size = androidx.compose.ui.geometry.Size(step, step)
                        )
                    }
                }
            }
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            
            // Header
            Text(
                text = "SPICYVPN",
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
                letterSpacing = 4.sp,
                modifier = Modifier.padding(top = 32.dp)
            )

            // Connect Button (Pulse Animation)
            val infiniteTransition = rememberInfiniteTransition()
            val pulseScale by infiniteTransition.animateFloat(
                initialValue = 1f,
                targetValue = 1.05f,
                animationSpec = infiniteRepeatable(
                    animation = tween(2000, easing = FastOutSlowInEasing),
                    repeatMode = RepeatMode.Reverse
                )
            )

            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .size(200.dp)
                    .clip(CircleShape)
                    .border(2.dp, Color.White.copy(alpha = 0.1f), CircleShape)
                    .background(Color.White.copy(alpha = 0.05f))
                    .clickable { onConnectClick() }
            ) {
                Text(
                    text = "CONNECT",
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp,
                    letterSpacing = 2.sp,
                    modifier = Modifier.alpha(if (pulseScale > 1.02f) 1f else 0.8f) // Subtle alpha pulse
                )
            }

            // Sublink Input
            OutlinedTextField(
                value = sublink,
                onValueChange = onSublinkChange,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 32.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(Color.White.copy(alpha = 0.05f)), // Glassmorphism
                placeholder = { 
                    Text("Paste SpicyVPN Sublink...", color = Color.White.copy(alpha = 0.3f)) 
                },
                textStyle = LocalTextStyle.current.copy(color = Color.White),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = Color.Transparent,
                    unfocusedContainerColor = Color.Transparent,
                    focusedIndicatorColor = Color.White.copy(alpha = 0.5f),
                    unfocusedIndicatorColor = Color.Transparent,
                ),
                maxLines = 1,
                singleLine = true
            )
        }
    }
}
