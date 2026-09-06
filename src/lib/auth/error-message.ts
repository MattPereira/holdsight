import { EMAIL_NOT_ALLOWED } from "@/lib/auth/access-error-code";

export type AuthErrorMessage = {
  title: string;
  description: string;
};

export function authErrorMessage(code: string | undefined): AuthErrorMessage {
  if (code === EMAIL_NOT_ALLOWED) {
    return {
      title: "Access denied",
      description:
        "This email isn’t approved for this Holdsight instance. Contact the instance owner or sign in with another account.",
    };
  }

  return {
    title: "Sign-in failed",
    description: "We couldn’t sign you in. Please try again.",
  };
}
