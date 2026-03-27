import { useState, useEffect, createContext, useContext, ReactNode } from "react";

interface User {
  email: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const VALID_EMAIL = "admin@bcs-hr.nl";
const VALID_PASSWORD = "admin123";
const STORAGE_KEY = "bcs-auth-user";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setUser(JSON.parse(stored));
    }
    setLoading(false);
  }, []);

  const signIn = async (email: string, password: string) => {
    if (email === VALID_EMAIL && password === VALID_PASSWORD) {
      const user = { email };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      setUser(user);
      return { error: null };
    }
    return { error: new Error("Invalid credentials") };
  };

  const signOut = async () => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
