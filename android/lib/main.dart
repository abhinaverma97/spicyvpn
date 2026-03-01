import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'screens/home_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  runApp(SpicyVPNApp(prefs: prefs));
}

class SpicyVPNApp extends StatelessWidget {
  final SharedPreferences prefs;
  const SpicyVPNApp({super.key, required this.prefs});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SpicyVPN',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: Colors.white,
          brightness: Brightness.dark,
        ),
        scaffoldBackgroundColor: const Color(0xFF000000),
        fontFamily: 'SF Pro Display',
        useMaterial3: true,
      ),
      home: HomeScreen(prefs: prefs),
    );
  }
}
