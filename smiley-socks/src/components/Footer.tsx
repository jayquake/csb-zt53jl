import { Link } from 'react-router-dom';
import { Wordmark } from '../brand/Grinline';
import { DONATION_RATE } from '../store/catalog';

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer__inner">
        <div className="footer__brand">
          <Wordmark />
          <p className="footer__line">Wear how you feel.</p>
        </div>

        <nav className="footer__nav" aria-label="Footer">
          <Link to="/studio">Design a pair</Link>
          <Link to="/10-percent">Where the {Math.round(DONATION_RATE * 100)}% goes</Link>
          <Link to="/bag">Bag</Link>
        </nav>

        <p className="footer__note">
          This is a demo storefront. Nothing ships, no payment is taken, and no order is placed. If you're
          struggling right now, talk to someone real: in the US call or text <strong>988</strong>, or find a
          line where you are at <strong>findahelpline.com</strong>.
        </p>
      </div>
    </footer>
  );
}
