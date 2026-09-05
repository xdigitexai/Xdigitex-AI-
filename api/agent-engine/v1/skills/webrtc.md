# WebRTC verification

Require two authenticated peers. Verify incoming call, accept, remote tracks in both directions, increasing inbound/outbound RTP packets through `getStats()`, hangup cleanup and video rendering. Record each direction separately. Missing browser/media evidence is `not_tested`.
