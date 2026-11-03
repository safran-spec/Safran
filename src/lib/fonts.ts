import { Amiri, Caveat } from "next/font/google";

/** Only used on the homepage Hilal badge — keep out of the root layout. */
export const amiri = Amiri({
  subsets: ["arabic"],
  weight: ["700"],
  display: "swap",
});

/** Order-status + admin handwritten accents — load only on those surfaces. */
export const caveat = Caveat({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-caveat",
  display: "swap",
});
