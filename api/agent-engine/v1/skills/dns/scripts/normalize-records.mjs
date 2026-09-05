export const normalizeDnsRecords = records => [...new Set((records || []).map(value => String(value).trim().toLowerCase()).filter(Boolean))].sort()
