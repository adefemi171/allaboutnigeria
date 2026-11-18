import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About · All About Nigeria",
  description:
    "What All About Nigeria is, how the guides are written, how to read the 3D maps, where the data comes from, and how to report a mistake.",
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
