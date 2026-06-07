import React from "react";
import QuizClient from "./QuizClient";

interface PageProps {
  params: Promise<{ bookId: string }>;
}

import fs from "fs";
import path from "path";

export function generateStaticParams() {
  const filePath = path.join(process.cwd(), "public", "books.json");
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return Object.entries(data)
    .filter(([_, book]: [string, any]) => book.status === "ready")
    .map(([bookId]) => ({ bookId }));
}

export default async function QuizPage({ params }: PageProps) {
  const { bookId } = await params;
  return <QuizClient bookId={bookId} />;
}
