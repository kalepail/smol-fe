{
  "provider": "xbull",
  "conclusion": "SUPPORTS C-AUTH",
  "notes": [
    "xBull returns unsigned XDR that can be signed by smart account",
    "Uses NULL_ACCOUNT as sender for quote, recipient can be C-address",
    "No G-address signature required from API - delegated to caller"
  ],
  "quoteEndpoint": "/swaps/quote",
  "buildEndpoint": "/swaps/accept-quote",
  "verified": true
}