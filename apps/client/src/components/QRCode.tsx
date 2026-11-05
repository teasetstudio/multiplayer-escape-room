import { useEffect, useState } from 'react';
import QR from 'qrcode';
import { joinUrl } from '../game/network/config';

export function QRCode({ code }: { code: string }) {
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let cancelled = false;
    try {
      const link = joinUrl(code);
      setUrl(link);
      void QR.toDataURL(link, {
        width: 360,
        margin: 3,
        errorCorrectionLevel: 'M',
        color: { dark: '#142019', light: '#f8f9f0' },
      })
        .then((value) => {
          if (!cancelled) setImage(value);
        })
        .catch(() => {
          if (!cancelled) setError('Could not generate the QR code. Use the join link below.');
        });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Invalid public client URL.');
    }
    return () => {
      cancelled = true;
    };
  }, [code]);
  return (
    <div className="qr-content">
      {image ? (
        <div className="qr-frame">
          <img src={image} alt={`Scan to join game ${code}`} width="280" height="280" />
        </div>
      ) : (
        <div className="qr-placeholder">
          <span>{error ? 'Phone link needs setup' : 'Creating your QR code…'}</span>
        </div>
      )}
      {error && (
        <p className="error-notice" role="alert">
          {error}
        </p>
      )}
      {url && (
        <>
          <p className="qr-instruction">Open your phone camera. Scan. You’re in.</p>
          <button
            className="text-button copy-link"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(url)
                .then(() => setCopied(true))
                .catch(() => setCopied(false));
            }}
          >
            {copied ? 'Link copied ✓' : 'Copy join link ↗'}
          </button>
          <input
            className="join-link"
            aria-label="Player join link"
            value={url}
            readOnly
            onFocus={(event) => event.target.select()}
          />
        </>
      )}
    </div>
  );
}
