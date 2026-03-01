import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/api_service.dart';

class TokenScreen extends StatefulWidget {
  final String? currentToken;
  const TokenScreen({super.key, this.currentToken});

  @override
  State<TokenScreen> createState() => _TokenScreenState();
}

class _TokenScreenState extends State<TokenScreen> {
  late final TextEditingController _controller;
  bool _loading = false;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.currentToken ?? '');
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _validate() async {
    final token = _controller.text.trim();
    if (token.isEmpty) {
      setState(() => _error = 'Please enter your token');
      return;
    }

    setState(() {
      _loading = true;
      _error = '';
    });

    try {
      await ApiService.connect(token); // validate it works
      if (mounted) Navigator.pop(context, token);
    } catch (e) {
      setState(() {
        _error = e.toString().replaceAll('Exception: ', '');
        _loading = false;
      });
    }
  }

  Future<void> _paste() async {
    final data = await Clipboard.getData('text/plain');
    if (data?.text != null) {
      _controller.text = data!.text!.trim();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: const Text(
          'Enter Token',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
        ),
        elevation: 0,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: Colors.white10),
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 16),
            const Text(
              'Your access token',
              style: TextStyle(
                color: Colors.white,
                fontSize: 22,
                fontWeight: FontWeight.bold,
                letterSpacing: -0.5,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Get your token from spicypepper.app after signing in.',
              style: TextStyle(color: Colors.white38, fontSize: 14, height: 1.5),
            ),
            const SizedBox(height: 32),

            // Token input
            Container(
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.04),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: _error.isNotEmpty ? Colors.redAccent.withOpacity(0.5) : Colors.white12,
                ),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      style: const TextStyle(
                        color: Colors.white,
                        fontFamily: 'monospace',
                        fontSize: 16,
                        letterSpacing: 1.5,
                      ),
                      decoration: const InputDecoration(
                        hintText: 'spx_xxxxxxxxxxxxxxxx',
                        hintStyle: TextStyle(color: Colors.white24, letterSpacing: 1),
                        border: InputBorder.none,
                        contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                      ),
                      onSubmitted: (_) => _validate(),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.content_paste, color: Colors.white38, size: 20),
                    onPressed: _paste,
                    tooltip: 'Paste',
                  ),
                ],
              ),
            ),

            if (_error.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(
                _error,
                style: const TextStyle(color: Colors.redAccent, fontSize: 13),
              ),
            ],

            const SizedBox(height: 24),

            // Confirm button
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _loading ? null : _validate,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.white,
                  foregroundColor: Colors.black,
                  padding: const EdgeInsets.symmetric(vertical: 18),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  elevation: 0,
                ),
                child: _loading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(color: Colors.black, strokeWidth: 2),
                      )
                    : const Text(
                        'Confirm',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                      ),
              ),
            ),

            const SizedBox(height: 16),

            // Open website
            Center(
              child: TextButton(
                onPressed: () {
                  // Could launch URL here
                },
                child: const Text(
                  'Get your token → spicypepper.app',
                  style: TextStyle(color: Colors.white38, fontSize: 13),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
