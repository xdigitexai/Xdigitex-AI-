export function summarizeSslInspection({ domain, dns = [], webServer, vhost, documentRoot, certificate = {} } = {}) {
  return { domain, dns: [...new Set(dns)], webServer: webServer || null, vhost: vhost || null, documentRoot: documentRoot || null, certificate: { subject: certificate.subject || null, issuer: certificate.issuer || null, san: certificate.san || [], expiresAt: certificate.expiresAt || null } }
}
