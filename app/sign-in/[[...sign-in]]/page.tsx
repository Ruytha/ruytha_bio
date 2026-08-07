import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-16">
      <SignIn
        appearance={{
          variables: {
            colorPrimary: "#7C5CFF",
            colorBackground: "#14121F",
            colorText: "#F5F3FF",
            colorInputBackground: "rgba(245,243,255,0.06)",
            colorInputText: "#F5F3FF",
            borderRadius: "1rem",
          },
        }}
      />
    </div>
  );
}
