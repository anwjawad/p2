// Deployment configuration. The only file to edit when the backend moves.
// These are public Apps Script "web app" URLs; they are not secrets. Protect the
// data with the APP_ACCESS_CODE script property (see docs/DEPLOYMENT.md).
window.APP_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbxJ0bG4MEptJCL_4057PM1UkFXrVSp5Vyydrq4ZvAUzGt3-gqyGq4aV1UhRpi90tszK/exec',
  HVC_API_URL: 'https://script.google.com/macros/s/AKfycbzKCvkaQ8sDBoYCTWd9K4Rt9L4MPK3p1llGZwDT5nd5E33NeRen1l973EtFQyI42FvQ/exec',
  PE_API_URL: 'https://script.google.com/macros/s/AKfycbwjwZcOtRy0SmgBZABxPVDE30NHD2y_Tfu8py5P_VmETiPZz07QHleM7vTQYWyaZQB2/exec',
  PORTCATH_API_URL: 'https://script.google.com/macros/s/AKfycbyxuzwed0kHqZ3jPJKWKemX0huzKOFvm-1nooaTlo3NwEePG-ElI_9xkADLjTk-R6bK/exec',
  // Shared key expected by the external Port Cath script (visible to any user of the app).
  PORTCATH_API_KEY: 'medsched-2026-key-abc123',
  ENV: 'production'
};
