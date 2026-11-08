import React from 'react';

/** One consistent 1.6px-stroke icon set (24px grid), drawn for this app. */
type IconProps = { size?: number; className?: string; title?: string };

function Svg({ size = 16, className, title, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export const IconOverview = (p: IconProps) => (
  <Svg {...p}><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="4.5" rx="1.5" /><rect x="13.5" y="11" width="7" height="9.5" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /></Svg>
);
export const IconSurvey = (p: IconProps) => (
  <Svg {...p}><rect x="5" y="3.5" width="14" height="17" rx="2" /><path d="M9 3.5v2h6v-2" /><path d="M8.5 11l1.5 1.5L13 9.5" /><path d="M8.5 16.5h7" /></Svg>
);
export const IconSources = (p: IconProps) => (
  <Svg {...p}><path d="M4 6.5h16M4 12h16M4 17.5h10" /><circle cx="18.5" cy="17.5" r="2" /></Svg>
);
export const IconSpark = (p: IconProps) => (
  <Svg {...p}><path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z" /><path d="M18.5 16v4M16.5 18h4" /></Svg>
);
export const IconThemes = (p: IconProps) => (
  <Svg {...p}><circle cx="7" cy="8" r="3" /><circle cx="17" cy="7" r="2.5" /><circle cx="14" cy="17" r="3.5" /><path d="M9.6 9.6l2.4 4M15.9 9.3l-.9 4.3" /></Svg>
);
export const IconTriangulate = (p: IconProps) => (
  <Svg {...p}><path d="M12 4l8 14H4z" /><circle cx="12" cy="4" r="1.6" /><circle cx="4" cy="18" r="1.6" /><circle cx="20" cy="18" r="1.6" /><path d="M12 9.5v4.5" /></Svg>
);
export const IconTarget = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1.2" /></Svg>
);
export const IconCheckSquare = (p: IconProps) => (
  <Svg {...p}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></Svg>
);
export const IconLog = (p: IconProps) => (
  <Svg {...p}><path d="M7 3.5h7l4.5 4.5v12.5H7z" /><path d="M14 3.5V8h4.5" /><path d="M10 12.5h5.5M10 16h5.5" /></Svg>
);
export const IconMore = (p: IconProps) => (
  <Svg {...p}><circle cx="6" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="18" cy="12" r="1.2" /></Svg>
);
export const IconInfo = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5" /><circle cx="12" cy="7.8" r=".6" fill="currentColor" /></Svg>
);
export const IconAlert = (p: IconProps) => (
  <Svg {...p}><path d="M12 4l9 15.5H3z" /><path d="M12 10v4.5" /><circle cx="12" cy="17" r=".6" fill="currentColor" /></Svg>
);
export const IconExternal = (p: IconProps) => (
  <Svg {...p}><path d="M14 4.5h5.5V10" /><path d="M19.5 4.5L11 13" /><path d="M17 14v5.5H4.5V7H10" /></Svg>
);
export const IconDownload = (p: IconProps) => (
  <Svg {...p}><path d="M12 4v11" /><path d="M7.5 10.5L12 15l4.5-4.5" /><path d="M5 19.5h14" /></Svg>
);
export const IconArrowRight = (p: IconProps) => (
  <Svg {...p}><path d="M5 12h14" /><path d="M13.5 6.5L19 12l-5.5 5.5" /></Svg>
);
export const IconUpload = (p: IconProps) => (
  <Svg {...p}><path d="M12 15V4" /><path d="M7.5 8.5L12 4l4.5 4.5" /><path d="M5 19.5h14" /></Svg>
);
export const IconGraph = (p: IconProps) => (
  <Svg {...p}><circle cx="6" cy="6" r="2.2" /><circle cx="18" cy="8" r="2.2" /><circle cx="9" cy="18" r="2.2" /><path d="M8 7l8 .8M7 8l1.6 8M16.5 9.7L10.6 16.6" /></Svg>
);
export const IconCompass = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></Svg>
);
export const IconFlask = (p: IconProps) => (
  <Svg {...p}><path d="M9.5 3.5h5M10.5 3.5v5.5L5 19a1.2 1.2 0 001 1.5h12a1.2 1.2 0 001-1.5l-5.5-10V3.5" /><path d="M7.5 15h9" /></Svg>
);
export const IconScale = (p: IconProps) => (
  <Svg {...p}><path d="M12 4v16M6 20h12M5 8h14" /><path d="M5 8l-2.5 6a2.8 2.8 0 005 0zM19 8l-2.5 6a2.8 2.8 0 005 0z" /></Svg>
);
