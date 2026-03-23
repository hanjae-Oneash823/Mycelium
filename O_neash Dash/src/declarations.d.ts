// Type declarations for packages with missing or incomplete type definitions

interface ImportMeta {
  readonly env: Record<string, string | boolean | undefined> & { DEV: boolean; PROD: boolean };
}


declare module "pixelarticons/react" {
  import * as React from "react";

  export interface PixelIconProps extends React.SVGProps<SVGSVGElement> {
    size?: number | string;
  }

  export type PixelIcon = React.FC<PixelIconProps>;

  export const Terminal: PixelIcon;
  export const Notes: PixelIcon;
  export const CheckDouble: PixelIcon;
  export const SettingsCog2: PixelIcon;
  export const Analytics: PixelIcon;
  export const TeachSharp: PixelIcon;
  export const BookOpen: PixelIcon;
  export const Clipboard: PixelIcon;
  export const Camera: PixelIcon;
  export const MapPin: PixelIcon;
  export const Grid2x22: PixelIcon;
  export const Human: PixelIcon;
  export const Trophy: PixelIcon;
  export const Bed: PixelIcon;
  export const Fish: PixelIcon;
  export const PcCase: PixelIcon;
  export const CoffeeSharp: PixelIcon;
  export const StickyNoteText: PixelIcon;
  export const ImageSharp: PixelIcon;
  export const Zap: PixelIcon;
  export const Calendar: PixelIcon;
  export const Target: PixelIcon;
  export const GitBranch: PixelIcon;
  export const AlarmClock: PixelIcon;
  export const CheckboxOn: PixelIcon;
  export const ArrowLeftBox: PixelIcon;
  export const ArrowRightBox: PixelIcon;
  export const CornerUpRight: PixelIcon;
  export const PenSquare: PixelIcon;
  export const SkullSharp: PixelIcon;
  export const ChevronDown: PixelIcon;
  export const ChevronRight: PixelIcon;
  export const Tea: PixelIcon;
  export const Forward: PixelIcon;
  export const PlusBox: PixelIcon;
  export const Fire: PixelIcon;
  export const PartyPopper: PixelIcon;
  export const Contact: PixelIcon;
  export const Frown: PixelIcon;
  export const HumanArmsUp: PixelIcon;
  export const ArrowBarUp: PixelIcon;
  export const Presentation: PixelIcon;
  export const Radio: PixelIcon;
  export const Gps: PixelIcon;
  // Catch-all for any other icons used in future
  const _: Record<string, PixelIcon>;
  export default _;
}
