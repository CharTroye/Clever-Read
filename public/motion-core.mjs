// Exact critically damped integration. Retargeting preserves position and velocity.
export function advanceSpring(value, velocity, target, seconds, response = .3) {
  const omega = 2 * Math.PI / response;
  const error = value - target, c = velocity + omega * error, decay = Math.exp(-omega * seconds);
  return { value: target + (error + c * seconds) * decay, velocity: (velocity - omega * c * seconds) * decay };
}
export function fitRect(from, to) {
  const scale = Math.min(from.width / to.width, from.height / to.height);
  return { scale, x: from.left + (from.width - to.width * scale) / 2 - to.left, y: from.top + (from.height - to.height * scale) / 2 - to.top };
}
