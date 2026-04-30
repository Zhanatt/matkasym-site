import { useState } from 'react';
import { adminDeleteImage } from '../api/index';
import './ImageUploader.css';

const CLOUD_NAME    = 'dnbg21ef8';
const UPLOAD_PRESET = 'Matkasym';

export default function ImageUploader({ images = [], onChange }) {
  const [deleting, setDeleting] = useState(null); // url being deleted
  const openWidget = () => {
    const batch = []; // собираем все загруженные URL в одну сессию
    window.cloudinary.openUploadWidget(
      {
        cloudName:    CLOUD_NAME,
        uploadPreset: UPLOAD_PRESET,
        sources:      ['local', 'url', 'camera'],
        multiple:     true,
        maxFiles:     10,
        language:     'ru',
        text: {
          ru: {
            or:            'или',
            back:          'Назад',
            advanced:      'Дополнительно',
            close:         'Закрыть',
            no_results:    'Нет результатов',
            upload_error:  'Ошибка загрузки',
            dropzone:      { title: 'Перетащите фото сюда' },
            local:         { browse:  'Выбрать файл', dd_title_single: 'Перетащите файл', dd_title_multi: 'Перетащите файлы' },
          },
        },
        styles: {
          palette: {
            window:      '#FFFFFF',
            windowBorder:'#E8E8E8',
            tabIcon:     '#E10523',
            menuIcons:   '#7D96A0',
            textDark:    '#000000',
            textLight:   '#FFFFFF',
            link:        '#E10523',
            action:      '#E10523',
            inactiveTabIcon: '#999999',
            error:       '#F44235',
            inProgress:  '#7D96A0',
            complete:    '#2D7A3A',
            sourceBg:    '#FAFAFA',
          },
          fonts: { default: null, "'Inter', sans-serif": { url: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap', active: true } },
        },
      },
      (error, result) => {
        if (error) return;
        if (result.event === 'success') {
          batch.push(result.info.secure_url);
        }
        // queues-end — все файлы обработаны, добавляем разом
        if (result.event === 'queues-end' && batch.length > 0) {
          onChange([...images, ...batch]);
        }
      }
    );
  };

  const remove = async (idx) => {
    const url = images[idx];
    setDeleting(url);
    try {
      if (url.includes('cloudinary.com')) {
        await adminDeleteImage(url);
      }
    } catch (e) {
      console.error('Cloudinary delete error:', e);
    } finally {
      setDeleting(null);
      onChange(images.filter((_, i) => i !== idx));
    }
  };

  const move = (from, to) => {
    const arr = [...images];
    arr.splice(to, 0, arr.splice(from, 1)[0]);
    onChange(arr);
  };

  return (
    <div className="img-uploader">
      <div className="img-uploader__grid">
        {images.map((url, i) => (
          <div key={url} className={`img-uploader__item ${deleting === url ? 'deleting' : ''}`}>
            <img src={url} alt="" />
            {deleting === url && <div className="img-uploader__spinner" />}
            {i === 0 && <span className="img-uploader__main-badge">Главное</span>}
            <div className="img-uploader__actions">
              {i > 0 && (
                <button type="button" title="Сделать главным" onClick={() => move(i, 0)}>★</button>
              )}
              <button type="button" title="Удалить" disabled={deleting === url} onClick={() => remove(i)}>✕</button>
            </div>
          </div>
        ))}

        <button type="button" className="img-uploader__add" onClick={openWidget}>
          <span>+</span>
          <span>Добавить фото</span>
        </button>
      </div>

      {images.length > 0 && (
        <p className="img-uploader__hint">Первое фото — главное. Нажми ★ чтобы поменять порядок.</p>
      )}
    </div>
  );
}
