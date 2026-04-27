import { Link } from 'react-router-dom';
import './Footer.css';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-top">
        <div className="container footer-grid">
          <div className="footer-brand">
            <div className="footer-logo">
              <img src="/logos/logo-white.png" alt="MATKASYM" className="footer-logo-img" />
            </div>
            <p className="footer-tagline">Мы создаем мебель,<br/>которая служит вам.<br/><em>Не наоборот.</em></p>
            <p className="footer-addr">Бишкек, ул. Маева, Тепличный 1/2</p>
          </div>

          <div className="footer-col">
            <h4>Бренды</h4>
            <Link to="/brand/matkasym-home">MATKASYM HOME</Link>
            <Link to="/brand/matkasym-shaar">MATKASYM SHAAR</Link>
          </div>

          <div className="footer-col">
            <h4>Каталог HOME</h4>
            <Link to="/sets?brand=matkasym-home&set=taza-kiym">TAZA KIYM</Link>
            <Link to="/sets?brand=matkasym-home&set=kosh-kelniz">KOSH KELNIZ</Link>
            <Link to="/sets?brand=matkasym-home&set=achyk-asman">ACHYK ASMAN</Link>
            <Link to="/sets?brand=matkasym-home&set=den-sooluk">DEN SOOLUK</Link>
          </div>

          <div className="footer-col">
            <h4>Контакты</h4>
            <a href="tel:+996500001652">+996 500 001 652</a>
            <a href="tel:+996504200067">+996 504 200 067</a>
            <a href="mailto:matkasymovllc@gmail.com">matkasymovllc@gmail.com</a>
            <a href="https://instagram.com/matkasym_official" target="_blank" rel="noreferrer">@matkasym_official</a>
          </div>
        </div>
      </div>
      <div className="footer-bottom">
        <div className="container footer-bottom-inner">
          <span>© 2024 MATKASYM. Все права защищены.</span>
          <span>Первый завод в Кыргызстане международного уровня</span>
        </div>
      </div>
    </footer>
  );
}
