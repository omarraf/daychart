import { useEffect, useState } from 'react';
import { auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { signIn, signUp, signOutUser, googleSignIn, resetPassword, resendVerificationEmail } from '../auth';
import Modal from 'react-modal';

Modal.setAppElement('#root');

type AuthMode = 'signin' | 'signup' | 'forgot';

interface AuthButtonsProps {
  initiallyOpen?: boolean;
  showNavigation?: boolean;
  onModalClose?: () => void;
}

export default function AuthButtons({
  initiallyOpen = false,
  showNavigation = true,
  onModalClose,
}: AuthButtonsProps = {}) {
  const [user, setUser] = useState(auth.currentUser);
  const [showModal, setShowModal] = useState(initiallyOpen);
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  const clearForm = () => {
    setEmail('');
    setPassword('');
    setError('');
    setSuccessMessage('');
  };

  const closeModal = () => {
    setShowModal(false);
    setMode('signin');
    clearForm();
    setIsLoading(false);
    onModalClose?.();
  };

  const handleEmailSignIn = async () => {
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await signIn(email, password);
      closeModal();
    } catch (error: unknown) {
      setError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailSignUp = async () => {
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await signUp(email, password);
      // User stays signed in and can use the app
      // Verification email is sent (in auth.ts) but not required
      closeModal();
    } catch (error: unknown) {
      setError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogle = async () => {
    setIsLoading(true);
    setError('');

    try {
      await googleSignIn();
      closeModal();
    } catch (error: unknown) {
      setError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Please enter your email address');
      return;
    }

    setIsLoading(true);
    setError('');
    setSuccessMessage('');

    try {
      await resetPassword(email);
      setSuccessMessage('Password reset email sent! Check your inbox and spam folder.');
      setEmail('');
      // Auto-switch back to sign in after 3 seconds
      setTimeout(() => {
        setMode('signin');
        setSuccessMessage('');
      }, 3000);
    } catch (error: unknown) {
      setError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const getErrorMessage = (error: unknown): string => {
    // Type guard to check if error has the expected Firebase auth error structure
    if (error && typeof error === 'object' && 'code' in error) {
      const firebaseError = error as { code: string };
      switch (firebaseError.code) {
        case 'auth/user-not-found':
          return 'No account found with this email';
        case 'auth/wrong-password':
          return 'Incorrect password';
        case 'auth/invalid-credential':
          return 'Invalid email or password';
        case 'auth/email-already-in-use':
          return 'Email is already registered';
        case 'auth/weak-password':
          return 'Password must be at least 6 characters';
        case 'auth/invalid-email':
          return 'Please enter a valid email address';
        case 'auth/too-many-requests':
          return 'Too many failed attempts. Please try again later or reset your password.';
        case 'auth/network-request-failed':
          return 'Network error. Please check your connection.';
        case 'auth/popup-blocked':
          return 'Popup blocked. Please allow popups for this site.';
        case 'auth/popup-closed-by-user':
          return 'Sign-in cancelled';
        case 'auth/unauthorized-domain':
          return 'This domain is not authorized for Google sign-in. Please contact support.';
        case 'auth/user-disabled':
          return 'This account has been disabled';
        default:
          console.error('Unhandled auth error:', firebaseError.code);
          return `Authentication error: ${firebaseError.code}. Please try again.`;
      }
    }
    return 'An error occurred. Please try again.';
  };

  const handleKeyDown = (event: { key: string; }) => {
    if (event.key === 'Enter' && !isLoading) {
      if (mode === 'signin') {
        handleEmailSignIn();
      } else if (mode === 'signup') {
        handleEmailSignUp();
      } else if (mode === 'forgot') {
        handleForgotPassword();
      }
    }
  };

  const GoogleIcon = () => (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );

  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState('');

  const handleResendVerification = async () => {
    setIsResendingVerification(true);
    setVerificationMessage('');

    try {
      await resendVerificationEmail();
      setVerificationMessage('Verification email sent! Check your inbox.');
      setTimeout(() => setVerificationMessage(''), 5000);
    } catch (err) {
      console.error('Failed to resend verification email:', err);
      const code = (err as { code?: string })?.code;
      setVerificationMessage(
        code === 'auth/too-many-requests'
          ? 'Too many attempts. Please wait a few minutes and try again.'
          : `Failed to send verification email${code ? ` (${code})` : ''}. Please try again.`
      );
      setTimeout(() => setVerificationMessage(''), 5000);
    } finally {
      setIsResendingVerification(false);
    }
  };

  const handleReloadUser = () => {
    user?.reload().then(() => {
      // Force a re-render by setting user again
      setUser(auth.currentUser);
    });
  };

  if (user) {
    return (
      <>
        {!user.emailVerified && (
          <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white px-4 py-3 text-center text-sm font-medium shadow-lg">
            <div className="max-w-4xl mx-auto flex items-center justify-center gap-4 flex-wrap">
              <span>⚠️ Please verify your email address to access all features.</span>
              <button
                onClick={handleResendVerification}
                disabled={isResendingVerification}
                className="bg-white text-amber-600 px-3 py-1 rounded-md text-xs font-semibold hover:bg-amber-50 transition-colors disabled:opacity-50"
              >
                {isResendingVerification ? 'Sending...' : 'Resend Email'}
              </button>
              <button
                onClick={handleReloadUser}
                className="bg-white text-amber-600 px-3 py-1 rounded-md text-xs font-semibold hover:bg-amber-50 transition-colors"
              >
                Already Verified?
              </button>
              {verificationMessage && (
                <span className="text-xs bg-white/20 px-3 py-1 rounded-md">{verificationMessage}</span>
              )}
            </div>
          </div>
        )}
        <div className={`fixed ${!user.emailVerified ? 'top-16' : 'top-4'} right-4 flex items-center gap-4 bg-white/95 dark:bg-gray-800/95 backdrop-blur-md px-4 py-3 rounded-xl shadow-lg border border-white/80 dark:border-gray-700/80 transition-all`}>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700 dark:text-gray-200 font-medium">{user.email}</span>
            {user.emailVerified && (
              <span className="text-xs bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full" title="Email verified">✓</span>
            )}
          </div>
          <button
            className="bg-red-500 text-white border-none px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all hover:bg-red-600 hover:-translate-y-0.5"
            onClick={signOutUser}
          >
            Sign Out
          </button>
        </div>
      </>
    );
  }

  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const modalStyles = {
    overlay: {
      position: 'fixed' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    },
    content: {
      position: 'relative' as const,
      background: isDark
        ? 'linear-gradient(135deg, #1e2130 0%, #161922 100%)'
        : 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
      padding: '3rem 2.5rem',
      borderRadius: '24px',
      maxWidth: '440px',
      width: '90%',
      maxHeight: '90vh',
      overflowY: 'auto' as const,
      boxShadow: isDark
        ? '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.06)'
        : '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.8)',
      border: 'none',
      inset: 'auto',
    },
  };

  return (
    <>
      {showNavigation && (
        <nav className="fixed top-0 left-0 right-0 z-50 border-b border-gray-200 bg-white px-6 py-4 sm:px-8 dark:border-gray-800 dark:bg-gray-950">
          <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/favicon.svg" alt="" aria-hidden="true" className="h-7 w-7" />
            <span className="text-lg font-bold text-gray-900 dark:text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
              DayChart
            </span>
          </div>
          <button
            className="border-none bg-transparent px-2 py-1 text-sm font-medium text-gray-700 shadow-none transition-colors hover:bg-transparent hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400"
            onClick={() => setShowModal(true)}
          >
            Sign In
          </button>
          </div>
        </nav>
      )}

      <Modal
        isOpen={showModal}
        onRequestClose={closeModal}
        contentLabel="Authentication"
        style={modalStyles}
        closeTimeoutMS={200}
      >
        <button
          className="absolute top-6 right-6 bg-transparent border-none text-2xl text-slate-500 cursor-pointer p-2 rounded-full transition-all flex items-center justify-center w-10 h-10 hover:bg-slate-100 hover:text-slate-700 hover:scale-110"
          onClick={closeModal}
          aria-label="Close modal"
        >
          ×
        </button>

        <div className="text-center mb-6">
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-2 tracking-tight">
            {mode === 'forgot' ? 'Reset Password' : 'Welcome to DayChart'}
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-base font-normal m-0">
            {mode === 'forgot'
              ? 'Enter your email to receive a password reset link'
              : 'Manage your time visually'}
          </p>
        </div>

        {mode !== 'forgot' && (
          <div
            className="grid grid-cols-2 gap-1 mb-6 rounded-xl bg-slate-100 dark:bg-slate-800 p-1"
            role="tablist"
            aria-label="Authentication mode"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signin'}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setMode('signin');
                clearForm();
              }}
              className={`px-4 py-2.5 text-sm font-semibold rounded-lg border-none shadow-none transition-colors focus:ring-0 focus:ring-offset-0 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-800 ${
                mode === 'signin'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-sm'
                  : 'bg-transparent text-slate-500 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-700/60 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signup'}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setMode('signup');
                clearForm();
              }}
              className={`px-4 py-2.5 text-sm font-semibold rounded-lg border-none shadow-none transition-colors focus:ring-0 focus:ring-offset-0 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-800 ${
                mode === 'signup'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-sm'
                  : 'bg-transparent text-slate-500 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-700/60 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Sign Up
            </button>
          </div>
        )}

        <form className="flex flex-col gap-5" onSubmit={(e) => e.preventDefault()}>
          <div className="relative">
            <input
              className="w-full px-5 py-4 border-2 border-slate-200 rounded-xl text-base font-normal bg-white text-slate-900 outline-none transition-all box-border focus:border-blue-500 focus:bg-white focus:shadow-lg focus:shadow-blue-500/10 focus:-translate-y-0.5 hover:border-slate-300 placeholder:text-slate-400 placeholder:font-normal"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              autoComplete="email"
            />
          </div>

          {mode !== 'forgot' && (
            <div className="relative">
              <input
                className="w-full px-5 py-4 border-2 border-slate-200 rounded-xl text-base font-normal bg-white text-slate-900 outline-none transition-all box-border focus:border-blue-500 focus:bg-white focus:shadow-lg focus:shadow-blue-500/10 focus:-translate-y-0.5 hover:border-slate-300 placeholder:text-slate-400 placeholder:font-normal"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
            </div>
          )}

          {mode === 'signin' && (
            <div className="flex justify-end -mt-2">
              <button
                type="button"
                onClick={() => {
                  setMode('forgot');
                  clearForm();
                }}
                className="text-sm text-blue-600 hover:text-blue-700 hover:underline transition-colors"
              >
                Forgot password?
              </button>
            </div>
          )}

          {error && (
            <div className="text-red-600 text-sm p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="text-green-600 text-sm p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2">
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>{successMessage}</span>
            </div>
          )}

          <div className="flex flex-col gap-3 mt-1">
            {mode === 'signin' && (
              <button
                type="button"
                className="w-full px-6 py-4 text-base font-semibold border-none rounded-xl cursor-pointer transition-all relative overflow-hidden flex items-center justify-center min-h-12 no-underline bg-gradient-to-r from-blue-500 to-blue-800 text-white shadow-lg shadow-blue-500/40 disabled:opacity-60 disabled:cursor-not-allowed hover:from-blue-600 hover:to-blue-900 hover:shadow-xl hover:shadow-blue-500/50 hover:-translate-y-0.5 active:translate-y-0"
                onClick={handleEmailSignIn}
                disabled={isLoading}
              >
                {isLoading ? <div className="w-5 h-5 border-2 border-transparent border-t-current rounded-full animate-spin" /> : 'Sign In'}
              </button>
            )}

            {mode === 'signup' && (
              <button
                type="button"
                className="w-full px-6 py-4 text-base font-semibold border-none rounded-xl cursor-pointer transition-all relative overflow-hidden flex items-center justify-center min-h-12 no-underline bg-gradient-to-r from-blue-500 to-blue-800 text-white shadow-lg shadow-blue-500/40 disabled:opacity-60 disabled:cursor-not-allowed hover:from-blue-600 hover:to-blue-900 hover:shadow-xl hover:shadow-blue-500/50 hover:-translate-y-0.5 active:translate-y-0"
                onClick={handleEmailSignUp}
                disabled={isLoading}
              >
                {isLoading ? <div className="w-5 h-5 border-2 border-transparent border-t-current rounded-full animate-spin" /> : 'Create Account'}
              </button>
            )}

            {mode === 'forgot' && (
              <>
                <button
                  type="button"
                  className="w-full px-6 py-4 text-base font-semibold border-none rounded-xl cursor-pointer transition-all relative overflow-hidden flex items-center justify-center min-h-12 no-underline bg-gradient-to-r from-blue-500 to-blue-800 text-white shadow-lg shadow-blue-500/40 disabled:opacity-60 disabled:cursor-not-allowed hover:from-blue-600 hover:to-blue-900 hover:shadow-xl hover:shadow-blue-500/50 hover:-translate-y-0.5 active:translate-y-0"
                  onClick={handleForgotPassword}
                  disabled={isLoading}
                >
                  {isLoading ? <div className="w-5 h-5 border-2 border-transparent border-t-current rounded-full animate-spin" /> : 'Send Reset Email'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    clearForm();
                  }}
                  className="text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors bg-transparent border-none cursor-pointer p-2"
                >
                  Back to Sign In
                </button>
              </>
            )}

            {mode !== 'forgot' && (
              <>
                <div className="relative my-4 text-center">
                  <div className="absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
                  <span className="bg-gradient-to-r from-white to-slate-50 px-4 text-slate-600 text-sm font-medium relative z-10">OR</span>
                </div>

                <button
                  type="button"
                  className="w-full px-6 py-4 text-base font-semibold rounded-xl cursor-pointer transition-all relative overflow-hidden flex items-center justify-center min-h-12 no-underline gap-3 bg-white text-gray-700 border-2 border-gray-200 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed hover:bg-slate-50 hover:border-gray-300 hover:-translate-y-0.5 hover:shadow-lg"
                  onClick={handleGoogle}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-transparent border-t-current rounded-full animate-spin" />
                  ) : (
                    <>
                      <GoogleIcon />
                      Continue with Google
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </form>
      </Modal>
    </>
  );
}
