import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_v2ray/flutter_v2ray.dart';
import '../services/api_service.dart';
import '../models/vpn_config.dart';
import 'token_screen.dart';

enum VpnStatus { disconnected, connecting, connected }

class HomeScreen extends StatefulWidget {
  final SharedPreferences prefs;
  const HomeScreen({super.key, required this.prefs});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with SingleTickerProviderStateMixin {
  VpnStatus _status = VpnStatus.disconnected;
  String? _token;
  VpnConfig? _config;
  String _error = '';
  late FlutterV2ray _flutterV2ray;
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;

  @override
  void initState() {
    super.initState();
    _token = widget.prefs.getString('token');
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat(reverse: true);
    _pulseAnimation = Tween<double>(begin: 0.8, end: 1.0).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );
    _initV2ray();
  }

  Future<void> _initV2ray() async {
    _flutterV2ray = FlutterV2ray(
      onStatusChanged: (status) {
        setState(() {
          if (status.state == 'CONNECTED') {
            _status = VpnStatus.connected;
          } else if (status.state == 'DISCONNECTED') {
            _status = VpnStatus.disconnected;
          }
        });
      },
    );
    await _flutterV2ray.initializeV2Ray();
  }

  Future<void> _toggle() async {
    if (_status == VpnStatus.connected) {
      _flutterV2ray.stopV2Ray();
      return;
    }

    if (_token == null) {
      _goToTokenScreen();
      return;
    }

    setState(() {
      _status = VpnStatus.connecting;
      _error = '';
    });

    try {
      final config = await ApiService.connect(_token!);
      setState(() => _config = config);

      await _flutterV2ray.startV2Ray(
        remark: 'SpicyVPN',
        config: config.toVlessLink(),
        proxyOnly: false,
      );
    } catch (e) {
      setState(() {
        _status = VpnStatus.disconnected;
        _error = e.toString().replaceAll('Exception: ', '');
      });
    }
  }

  void _goToTokenScreen() async {
    final result = await Navigator.push<String>(
      context,
      MaterialPageRoute(builder: (_) => TokenScreen(currentToken: _token)),
    );
    if (result != null) {
      await widget.prefs.setString('token', result);
      setState(() => _token = result);
    }
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              // Header
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'SpicyVPN',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      letterSpacing: -0.5,
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.key_outlined, color: Colors.white38),
                    onPressed: _goToTokenScreen,
                    tooltip: 'Change token',
                  ),
                ],
              ),

              const Spacer(),

              // Status indicator
              AnimatedBuilder(
                animation: _pulseAnimation,
                builder: (context, child) {
                  return Transform.scale(
                    scale: _status == VpnStatus.connected ? _pulseAnimation.value : 1.0,
                    child: child,
                  );
                },
                child: Container(
                  width: 200,
                  height: 200,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: _statusColor().withOpacity(0.08),
                    border: Border.all(
                      color: _statusColor().withOpacity(0.3),
                      width: 1.5,
                    ),
                  ),
                  child: Center(
                    child: GestureDetector(
                      onTap: _toggle,
                      child: Container(
                        width: 120,
                        height: 120,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: _statusColor().withOpacity(0.12),
                          border: Border.all(
                            color: _statusColor(),
                            width: 2,
                          ),
                        ),
                        child: _status == VpnStatus.connecting
                            ? Center(
                                child: CircularProgressIndicator(
                                  color: _statusColor(),
                                  strokeWidth: 2,
                                ),
                              )
                            : Icon(
                                _status == VpnStatus.connected
                                    ? Icons.shield
                                    : Icons.shield_outlined,
                                color: _statusColor(),
                                size: 48,
                              ),
                      ),
                    ),
                  ),
                ),
              ),

              const SizedBox(height: 32),

              // Status text
              Text(
                _statusText(),
                style: TextStyle(
                  color: _statusColor(),
                  fontSize: 22,
                  fontWeight: FontWeight.w600,
                  letterSpacing: -0.5,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                _statusSubtext(),
                style: const TextStyle(
                  color: Colors.white38,
                  fontSize: 14,
                ),
                textAlign: TextAlign.center,
              ),

              if (_error.isNotEmpty) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  decoration: BoxDecoration(
                    color: Colors.red.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.red.withOpacity(0.3)),
                  ),
                  child: Text(
                    _error,
                    style: const TextStyle(color: Colors.redAccent, fontSize: 13),
                    textAlign: TextAlign.center,
                  ),
                ),
              ],

              const Spacer(),

              // Connect button
              if (_token == null)
                _buildSetupButton()
              else
                _buildConnectButton(),

              const SizedBox(height: 16),

              // Token display
              if (_token != null)
                GestureDetector(
                  onTap: () {
                    Clipboard.setData(ClipboardData(text: _token!));
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Token copied'),
                        backgroundColor: Colors.white10,
                        behavior: SnackBarBehavior.floating,
                      ),
                    );
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.04),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.white12),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.vpn_key, color: Colors.white24, size: 14),
                        const SizedBox(width: 8),
                        Text(
                          _token!,
                          style: const TextStyle(
                            color: Colors.white38,
                            fontSize: 13,
                            fontFamily: 'monospace',
                            letterSpacing: 1,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildConnectButton() {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(
        onPressed: _status == VpnStatus.connecting ? null : _toggle,
        style: ElevatedButton.styleFrom(
          backgroundColor: _status == VpnStatus.connected ? Colors.red.withOpacity(0.15) : Colors.white,
          foregroundColor: _status == VpnStatus.connected ? Colors.redAccent : Colors.black,
          padding: const EdgeInsets.symmetric(vertical: 18),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          elevation: 0,
          side: _status == VpnStatus.connected
              ? const BorderSide(color: Colors.redAccent, width: 1)
              : BorderSide.none,
        ),
        child: Text(
          _status == VpnStatus.connected ? 'Disconnect' : 'Connect',
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
      ),
    );
  }

  Widget _buildSetupButton() {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(
        onPressed: _goToTokenScreen,
        style: ElevatedButton.styleFrom(
          backgroundColor: Colors.white,
          foregroundColor: Colors.black,
          padding: const EdgeInsets.symmetric(vertical: 18),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          elevation: 0,
        ),
        child: const Text(
          'Enter your token',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
      ),
    );
  }

  Color _statusColor() {
    switch (_status) {
      case VpnStatus.connected:
        return const Color(0xFF34D399); // emerald
      case VpnStatus.connecting:
        return Colors.amber;
      case VpnStatus.disconnected:
        return Colors.white24;
    }
  }

  String _statusText() {
    switch (_status) {
      case VpnStatus.connected:
        return 'Protected';
      case VpnStatus.connecting:
        return 'Connecting...';
      case VpnStatus.disconnected:
        return 'Unprotected';
    }
  }

  String _statusSubtext() {
    switch (_status) {
      case VpnStatus.connected:
        return 'Your connection is secured\nand invisible to the network';
      case VpnStatus.connecting:
        return 'Establishing stealth tunnel...';
      case VpnStatus.disconnected:
        return _token == null
            ? 'Enter your token to get started'
            : 'Tap to connect';
    }
  }
}
