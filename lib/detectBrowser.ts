export function detectBrowserAndOS(userAgent?: string) {
  const ua = userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  
  let browser = 'Unknown';
  let os = 'Unknown';
  let deviceType = 'desktop';

  // Detect Browser
  if (ua.match(/Chrome/i)) browser = 'Chrome';
  else if (ua.match(/Firefox/i)) browser = 'Firefox';
  else if (ua.match(/Safari/i) && !ua.match(/Chrome/i)) browser = 'Safari';
  else if (ua.match(/Edg/i)) browser = 'Edge';
  else if (ua.match(/Opera|OPR/i)) browser = 'Opera';
  else if (ua.match(/MSIE|Trident/i)) browser = 'Internet Explorer';

  // Detect OS
  if (ua.match(/Windows/i)) os = 'Windows';
  else if (ua.match(/MacPPC|Macintosh/i)) os = 'macOS';
  else if (ua.match(/Linux/i)) os = 'Linux';
  else if (ua.match(/iPhone/i)) os = 'iOS';
  else if (ua.match(/Android/i)) os = 'Android';

  // Detect Device Type
  if (ua.match(/Mobile|Android|iPhone|iPad|iPod/i)) {
    deviceType = ua.match(/iPad/i) ? 'tablet' : 'mobile';
  }

  return { browser, os, deviceType };
}
