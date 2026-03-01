import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/vpn_config.dart';

class ApiService {
  static const String baseUrl = 'https://spicypepper.app';

  static Future<VpnConfig> connect(String token) async {
    final uri = Uri.parse('$baseUrl/api/connect?token=$token');
    final response = await http.get(uri);

    if (response.statusCode == 200) {
      return VpnConfig.fromJson(jsonDecode(response.body));
    } else {
      final body = jsonDecode(response.body);
      throw Exception(body['error'] ?? 'Connection failed');
    }
  }
}
