export async function notifyNewLogin() {
  try {
    // Send notification about successful login from new device
    const res = await fetch('/api/notify-login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    return await res.json();
  } catch (error) {
    console.error('Error notifying login:', error);
    return null;
  }
}
