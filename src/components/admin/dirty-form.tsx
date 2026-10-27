"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type FormHTMLAttributes,
  type ReactNode,
} from "react";

const DirtyFormContext = createContext<boolean | null>(null);

/** `null` = not inside a DirtyForm (button stays always enabled). */
export function useDirtyForm() {
  return useContext(DirtyFormContext);
}

/** Renders children only after the parent `DirtyForm` has been edited. */
export function DirtyOnly({ children }: { children: ReactNode }) {
  const dirty = useDirtyForm();
  if (!dirty) return null;
  return children;
}

type DirtyFormProps = Omit<FormHTMLAttributes<HTMLFormElement>, "onChange" | "onInput"> & {
  children: ReactNode;
  /** Start enabled (rare). Default: disabled until the user changes something. */
  initiallyDirty?: boolean;
};

/**
 * Tracks whether the user changed any field. Submit buttons that opt in via
 * `PendingSubmitButton` stay disabled until then.
 */
export function DirtyForm({
  children,
  initiallyDirty = false,
  ...formProps
}: DirtyFormProps) {
  const [dirty, setDirty] = useState(initiallyDirty);
  const markDirty = useCallback(() => setDirty(true), []);
  const value = useMemo(() => dirty, [dirty]);

  return (
    <DirtyFormContext.Provider value={value}>
      <form {...formProps} onChange={markDirty} onInput={markDirty}>
        {children}
      </form>
    </DirtyFormContext.Provider>
  );
}
