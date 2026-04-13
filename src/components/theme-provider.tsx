import { useEffect } from "react";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
	useEffect(() => {
		// Dark mode only — always add dark class
		document.documentElement.classList.add("dark");
	}, []);

	return <>{children}</>;
}
