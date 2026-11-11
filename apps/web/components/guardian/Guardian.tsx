interface Props {
  tamano?: number;
  className?: string;
}

export function Guardian({ tamano = 32, className }: Props) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={tamano}
      height={tamano}
      className={className ? `gd ${className}` : 'gd'}
      style={{ overflow: 'visible' }}
      aria-hidden="true"
    >
      <g className="gd-body">
        <g className="gd-tail">
          <path d="M34 50 L46 60" stroke="#1F6FB2" strokeWidth="3" strokeLinecap="round" fill="none" />
          <path d="M31 52 L40 61" stroke="#1F6FB2" strokeWidth="3" strokeLinecap="round" fill="none" />
          <ellipse cx="47.5" cy="61" rx="3.4" ry="2.3" fill="#27B5A5" transform="rotate(40 47.5 61)" />
          <ellipse cx="41.5" cy="62" rx="3" ry="2" fill="#27B5A5" transform="rotate(48 41.5 62)" />
        </g>
        <ellipse cx="30" cy="40" rx="15" ry="13" fill="#E58A2D" />
        <path d="M17 36 C13 43 16 51 25 51 C22 45 22 39 27 33 Z" fill="#1F6FB2" />
        <circle cx="30" cy="22" r="14" fill="#27B5A5" />
        <path d="M17 19 Q30 3 43 19 Q30 13 17 19 Z" fill="#1E9A8C" />
        <path d="M16 22 Q30 16 44 22 Q30 30 16 22 Z" fill="#0F172A" />
        <g className="gd-eyes">
          <circle cx="24" cy="22" r="4.6" fill="#ffffff" />
          <circle cx="36" cy="22" r="4.6" fill="#ffffff" />
          <circle cx="24.8" cy="22.5" r="2.6" fill="#0F172A" />
          <circle cx="36.8" cy="22.5" r="2.6" fill="#0F172A" />
          <circle cx="25.8" cy="21.4" r="0.9" fill="#ffffff" />
          <circle cx="37.8" cy="21.4" r="0.9" fill="#ffffff" />
        </g>
        <circle cx="19.5" cy="28" r="2" fill="#F2B00A" opacity="0.7" />
        <circle cx="40.5" cy="28" r="2" fill="#F2B00A" opacity="0.7" />
        <path d="M27 28.5 L30 33.5 L33 28.5 Z" fill="#1E293B" />
      </g>
    </svg>
  );
}
