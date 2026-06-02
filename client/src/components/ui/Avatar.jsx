// Avatar definitions — each is a unique marshmallow character
export const AVATARS = {
  marshmallow1: { emoji: '🍡', color: '#ff6eb4', label: 'Pinky' },
  marshmallow2: { emoji: '🌊', color: '#40e0d0', label: 'Aqua' },
  marshmallow3: { emoji: '🔥', color: '#ff9240', label: 'Toasty' },
  marshmallow4: { emoji: '⭐', color: '#ffd94a', label: 'Starburst' },
  marshmallow5: { emoji: '🍀', color: '#6bea7a', label: 'Lucky' },
  marshmallow6: { emoji: '🫐', color: '#9b7fe8', label: 'Bluebell' },
};

export function Avatar({ id, size = 40, className = '' }) {
  const avatar = AVATARS[id] || AVATARS.marshmallow1;
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: `radial-gradient(circle at 35% 35%, ${avatar.color}cc, ${avatar.color}44)`,
        border: `2px solid ${avatar.color}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.5,
        flexShrink: 0,
        boxShadow: `0 0 8px ${avatar.color}44`,
      }}
    >
      {avatar.emoji}
    </div>
  );
}
