export {};

declare global {
  interface Window {
    s1?: {
      openSong: () => Promise<{ name: string; data: Uint8Array } | null>;
      saveFile: (payload: { defaultName: string; data: Uint8Array }) => Promise<string | null>;
      isDesktop: boolean;
    };
  }
}
