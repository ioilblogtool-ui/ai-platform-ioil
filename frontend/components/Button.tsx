interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

const VARIANTS = {
  primary: {
    background: 'linear-gradient(135deg, #c8a96e, #a8823e)',
    color: '#1a1208',
    border: 'none',
    boxShadow: '0 0 20px #c8a96e25',
  },
  secondary: {
    background: 'rgba(255,255,255,0.04)',
    color: '#9a98a8',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: 'none',
  },
  ghost: {
    background: 'transparent',
    color: '#5a5870',
    border: '1px solid rgba(255,255,255,0.06)',
    boxShadow: 'none',
  },
  danger: {
    background: 'rgba(248,113,113,0.1)',
    color: '#f87171',
    border: '1px solid rgba(248,113,113,0.25)',
    boxShadow: 'none',
  },
};

const SIZES = {
  sm: { padding: '5px 10px', fontSize: 11, borderRadius: 6 },
  md: { padding: '7px 14px', fontSize: 12, borderRadius: 8 },
  lg: { padding: '10px 20px', fontSize: 13, borderRadius: 9 },
};

export default function Button({ variant = 'secondary', size = 'md', children, style, ...props }: ButtonProps) {
  const v = VARIANTS[variant];
  const s = SIZES[size];
  return (
    <button
      {...props}
      style={{
        ...v, ...s,
        cursor: 'pointer',
        fontWeight: 500,
        display: 'inline-flex', alignItems: 'center', gap: 6,
        transition: 'opacity 0.15s',
        whiteSpace: 'nowrap',
        fontFamily: 'inherit',
        ...style,
      }}
    >
      {children}
    </button>
  );
}
