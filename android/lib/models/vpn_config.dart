class VpnConfig {
  final String server;
  final int port;
  final String uuid;
  final String flow;
  final String security;
  final String sni;
  final String publicKey;
  final String shortId;
  final String fingerprint;
  final DateTime expiresAt;

  VpnConfig({
    required this.server,
    required this.port,
    required this.uuid,
    required this.flow,
    required this.security,
    required this.sni,
    required this.publicKey,
    required this.shortId,
    required this.fingerprint,
    required this.expiresAt,
  });

  factory VpnConfig.fromJson(Map<String, dynamic> json) {
    return VpnConfig(
      server: json['server'],
      port: json['port'],
      uuid: json['uuid'],
      flow: json['flow'],
      security: json['security'],
      sni: json['sni'],
      publicKey: json['publicKey'],
      shortId: json['shortId'],
      fingerprint: json['fingerprint'],
      expiresAt: DateTime.parse(json['expiresAt']),
    );
  }

  // Build vless:// import link for flutter_v2ray
  String toVlessLink() {
    final params = Uri(queryParameters: {
      'encryption': 'none',
      'flow': flow,
      'security': security,
      'sni': sni,
      'fp': fingerprint,
      'pbk': publicKey,
      'sid': shortId,
      'type': 'tcp',
    }).query;
    return 'vless://$uuid@$server:$port?$params#SpicyVPN';
  }
}
