import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { logAccess, initAccessLogTable } from '../lib/db';

const PIRATE_ASCII = `
                                 _____
                              .-" .-. "-.
                            _/ '=(0.0)=' \\_
                          /\\|  .-'"-'-.  |/\\
                          \\ _\\_/\`---\`\\_/_/
                           /_|  \\---/  |_\\
                             /\\         /\\
                            / /|       |\\ \\
                           / / |       | \\ \\
                          /_/  |       |  \\_\\
                              _|       |_
                             /__|     |__\\

              ____  ____   ___      _ _____ ____ _____
             |  _ \\|  _ \\ / _ \\    | | ____/ ___|_   _|
             | |_) | |_) | | | |_  | |  _|| |     | |
             |  __/|  _ <| |_| | |_| | |__| |___  | |
             |_|   |_| \\_\\\\___/ \\___/|_____\\____| |_|

                       ____  _   _  ___  ____ _____
                      / ___|| | | |/ _ \\/ ___|_   _|
                     | |  _ | |_| | | | \\___ \\ | |
                     | |_| ||  _  | |_| |___) || |
                      \\____||_| |_|\\___/|____/ |_|

`;

interface Props {
  path: string;
}

export default function Home({ path }: Props) {
  return (
    <>
      <Head>
        <title>Project Ghost</title>
        <meta name="description" content="Project Ghost - Secure Communications" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className="container">
        <pre className="pirate">{PIRATE_ASCII}</pre>
        <h1 className="title">Welcome to Project Ghost</h1>
        <p className="subtitle">Secure. Anonymous. Unstoppable.</p>
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { req } = context;

  try {
    await initAccessLogTable();

    const sourceIp =
      (req.headers['x-real-ip'] as string) ||
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown';

    const userAgent = req.headers['user-agent'] || 'unknown';
    const path = req.url || '/';
    const referer = req.headers['referer'] as string | undefined;
    const country = req.headers['cf-ipcountry'] as string | undefined;

    const relevantHeaders: Record<string, string> = {};
    ['host', 'accept-language', 'accept-encoding', 'connection'].forEach(h => {
      if (req.headers[h]) {
        relevantHeaders[h] = req.headers[h] as string;
      }
    });

    await logAccess({
      sourceIp,
      userAgent,
      path,
      method: req.method || 'GET',
      referer,
      country,
      headers: relevantHeaders,
    });
  } catch (error) {
    console.error('Failed to log access:', error);
  }

  return {
    props: {
      path: req.url || '/',
    },
  };
};
