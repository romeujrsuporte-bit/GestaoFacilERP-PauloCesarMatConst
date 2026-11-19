import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
  showSlogan?: boolean;
  variant?: 'light' | 'dark';
  compact?: boolean;
}

export const ConecttaLogo: React.FC<LogoProps> = ({
  className = '',
  size = 36,
  showText = true,
  showSlogan = true,
  variant = 'light',
  compact = false,
}) => {
  return (
    <div className={`flex items-center ${compact ? 'gap-1.5' : 'gap-2.5'} ${className}`}>
      {/* Símbolo GestãoFácil: Organização (módulos em grid) + Controle & Simplicidade (check dinâmico ascendente) */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 44 44"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 drop-shadow-xs"
      >
        <defs>
          <linearGradient id="gf-grad-primary" x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse">
            <stop stopColor="#059669" />
            <stop offset="1" stopColor="#047857" />
          </linearGradient>
          <filter id="gf-shadow" x="0" y="2" width="44" height="44" filterUnits="userSpaceOnUse">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#047857" floodOpacity="0.25" />
          </filter>
        </defs>

        {/* Emblema quadrado suavemente arredondado */}
        <rect x="2" y="2" width="40" height="40" rx="11" fill="url(#gf-grad-primary)" filter="url(#gf-shadow)" />

        {/* Módulos de Organização (Grid sutil e limpo) */}
        <rect x="8" y="8" width="11" height="11" rx="3.5" fill="white" fillOpacity="0.22" />
        <rect x="23" y="8" width="11" height="11" rx="3.5" fill="white" fillOpacity="0.22" />
        <rect x="8" y="23" width="11" height="11" rx="3.5" fill="white" fillOpacity="0.22" />

        {/* Traço Fluido de Controle & Facilidade (Checkmark de alta precisão) */}
        <path
          d="M18 26.5L23.5 32L34 16"
          stroke="white"
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Ponto de destaque de conclusão */}
        <circle cx="34" cy="16" r="2.2" fill="#34D399" />
      </svg>

      {showText && (
        <div className="flex flex-col leading-tight select-none">
          <div className={`flex items-center ${compact ? 'gap-1' : 'gap-1.5'}`}>
            <span
              className={`${
                compact ? 'text-[10px] font-bold' : 'text-base sm:text-lg font-black'
              } tracking-tight font-sans ${
                variant === 'dark'
                  ? 'text-white'
                  : compact
                  ? 'text-slate-500'
                  : 'text-slate-900'
              }`}
            >
              Gestão<span className={compact ? 'text-emerald-700/80' : 'text-emerald-600'}>Fácil</span>
            </span>
            <span
              className={`${
                compact
                  ? 'text-[7px] px-1 py-0 bg-slate-100 text-slate-500 border border-slate-200'
                  : 'text-[9px] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 shadow-2xs'
              } font-black uppercase tracking-wider rounded font-mono`}
            >
              ERP
            </span>
          </div>

          {showSlogan && !compact && (
            <span
              className={`text-[10px] font-medium tracking-tight whitespace-nowrap hidden sm:inline ${
                variant === 'dark' ? 'text-emerald-200/80' : 'text-slate-500'
              }`}
            >
              Crescimento inteligente, gestão de verdade
            </span>
          )}
        </div>
      )}
    </div>
  );
};

// Aliases exportáveis para compatibilidade e clareza
export const GestaoFacilLogo = ConecttaLogo;
export const AppLogo = ConecttaLogo;
export default ConecttaLogo;

