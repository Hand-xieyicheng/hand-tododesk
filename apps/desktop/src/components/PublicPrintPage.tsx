import { useEffect, useState } from "react";
import { fetchPublicPrintHtml } from "../api/client";

type PublicPrintPageProps = {
  token: string;
};

export function PublicPrintPage({ token }: PublicPrintPageProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);

    fetchPublicPrintHtml(token)
      .then((html) => {
        if (!active) {
          return;
        }
        document.open();
        document.write(html);
        document.close();
      })
      .catch(() => {
        if (active) {
          setFailed(true);
        }
      });

    return () => {
      active = false;
    };
  }, [token]);

  if (failed) {
    return (
      <main className="public-print-page" role="alert">
        <h1>打印链接不可用</h1>
        <p>这个打印链接已失效或不存在。</p>
      </main>
    );
  }

  return (
    <main className="public-print-page" role="status" aria-live="polite">
      正在加载打印页面...
    </main>
  );
}
