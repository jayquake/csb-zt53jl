import { NavLink, Link } from 'react-router-dom';
import { Wordmark } from '../brand/Grinline';
import { useCart } from '../store/cart';

export function Header() {
  const { count } = useCart();

  return (
    <header className="header">
      <div className="header__inner">
        <Link className="header__logo" to="/" aria-label="Smiley Socks, home">
          <Wordmark />
        </Link>

        <nav className="header__nav" aria-label="Main">
          <NavLink to="/shop" className="header__link">
            Shop
          </NavLink>
          <NavLink to="/studio" className="header__link">
            Studio
          </NavLink>
          <NavLink to="/10-percent" className="header__link header__link--tuck">
            The 10%
          </NavLink>
          <NavLink to="/bag" className="header__link header__link--bag">
            Bag
            <span className={`bagcount${count ? ' bagcount--on' : ''}`} aria-hidden="true">
              {count}
            </span>
            <span className="visually-hidden">{count === 1 ? '1 pair' : `${count} pairs`}</span>
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
