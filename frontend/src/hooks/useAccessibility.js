import { useEffect, useRef, useCallback } from "react";

/**
 * Hook to trap focus within a container.
 * @param {boolean} isActive - Whether the focus trap should be active.
 * @param {Function} onEsc - Optional callback when Escape key is pressed.
 */
export function useFocusTrap(isActive, onEsc) {
    const containerRef = useRef(null);

    const handleKeyDown = useCallback((e) => {
        if (!isActive) return;

        if (e.key === "Escape" && onEsc) {
            onEsc();
            return;
        }

        if (e.key !== "Tab") return;

        if (!containerRef.current) return;

        const focusableElements = containerRef.current.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
            if (document.activeElement === firstElement) {
                lastElement.focus();
                e.preventDefault();
            }
        } else {
            if (document.activeElement === lastElement) {
                firstElement.focus();
                e.preventDefault();
            }
        }
    }, [isActive, onEsc]);

    useEffect(() => {
        if (isActive) {
            document.addEventListener("keydown", handleKeyDown);
            // Focus the first element when activated
            const focusableElements = containerRef.current?.querySelectorAll(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            if (focusableElements?.length > 0) {
                focusableElements[0].focus();
            }
        } else {
            document.removeEventListener("keydown", handleKeyDown);
        }

        return () => {
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [isActive, handleKeyDown]);

    return containerRef;
}

/**
 * Hook to manage focus when an overlay opens/closes.
 */
export function useFocusReturn(isActive) {
    const lastActiveElement = useRef(null);

    useEffect(() => {
        if (isActive) {
            lastActiveElement.current = document.activeElement;
        } else {
            if (lastActiveElement.current) {
                lastActiveElement.current.focus();
            }
        }
    }, [isActive]);
}
