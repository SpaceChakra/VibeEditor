type TranslationValue = string | string[];

class I18nManager {
  private translations: Record<string, TranslationValue> = {};

  public async init(): Promise<void> {
    return Promise.resolve();
  }

  public t(key: string, params?: Record<string, string | number>): string {
    const value = this.translations[key] ?? key;
    let text = Array.isArray(value) ? value[0] ?? key : value;

    if (params) {
      for (const [paramKey, paramValue] of Object.entries(params)) {
        text = text.replace(new RegExp(`{{${paramKey}}}`, 'g'), String(paramValue));
      }
    }

    return text;
  }
}

export const i18n = new I18nManager();

export function updatePageTranslations(): void {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = i18n.t(key);
  });
}
