import Link from "next/link";

export default function NotFound() {
  return (
    <div className="c-error">
      <div>
        <h1>404</h1>
        <p>This page could not be found.</p>
        <p style={{ marginTop: "1.5rem" }}>
          <Link href="/en">Back to Dooogs!</Link>
        </p>
      </div>
    </div>
  );
}
