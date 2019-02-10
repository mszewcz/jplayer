var projekktorMessages = (function (window, document, $, $p) {

    "use strict";

    return {

        // controlbar 
        "play": "odtwarzaj",
        "pause": "pauza",
        "fsexit": "wyłącz widok pełnoekranowy",
        "fsenter": "włącz widok pełnoekranowy",
        "settingsbtn": "ustawienia",
        "vmax": "maksymalna głośność",
        "vslider": "głośność",
        "vmarker": "głośność",
        "vknob": "głośność",
        "mute": "wycisz",
        "timeleft": "czas materiału",
        "golive": "na żywo",
        "scrubberdrag": "przewiń",
        "subtitlesbtn": "napisy",

        // settings 
        "help": "pomoc:",
        "keyboard controls": "klawiatura",
        "debug": "debug",
        "player info": "info",
        "platform": "platforma",
        "platform_flash": "Flash",
        "platform_native": "HTML5",
        "platform_mse": "MSE",
        "auto": "auto",
        "quality": "jakość",
        "high": "wysoka",
        "medium": "średnia",
        "low": "niska",

        // settings
        'ok': 'OK',
        'report': 'Zgłoś błąd',
        'cancel': 'anuluj',
        'continue': 'dalej',
        'sendto': 'Wyślij informację do administratora strony.',
        'please': 'Opisz błąd, który wystąpił na tyle dokładnie na ile to możliwe.',
        'thanks': 'Dziękujemy.',
        'error': 'Wystąpił błąd',
        'help1': '<em>spacja</em> odtwarzanie / pauza',
        'help2': '<em>góra</em><em>dół</em> głośność <em>lewo</em><em>prawo</em> przewijanie',
        'help3': '<em>ENTER</em> pełen ekran',
        'help4': 'Aby korzystać ze skrótów klawiaturowych wskaźnik myszy musi być na obszarze odtwarzacza.',

        // flash & native:
        "error0": '#0 Wystąpił nieznany błąd. Przepraszamy.',
        "error1": '#1 Anulowałeś odtwarzanie.',
        "error2": '#2 Problem sieciowy spowodował przerwanie ściągania pliku.',
        "error3": '#3 Odtwarzanie zostało przerwane ze względu na uszkodzenie pliku. Przepraszamy.',
        "error4": '#4 Wideo (%{title}) nie może zostać załadowane ze względu na problem z siecią bądź serwerem.',
        "error5": '#5 Przepraszamy, ale Twoja przeglądarka nie obsługuje wybranego formatu wideo. Skorzystaj z innej przeglądarki bądź zainstaluj plugin Adobe Flash.',
        "error6": '#6 Twoja przeglądarka nie posiada obsługi pluginu Flash w wersji %{flashver} bądź wyższej.',
        "error7": '#7 Brak plików do odtworzenia.',
        "error8": '#8 ! Skonfigurowano błędny model odtwarzania !',
        "error9": '#9 Plik (%{file}) nie został odnaleziony.',
        "error10": '#10 Błędne lub brakujące ustawienia jakości dla %{title}.',
        "error11": '#11 Błędny streamType i/lub streamServer dla %{title}.',
        "error12": '#12 Błędne lub niespójne ustawienia jakości dla %{title}.',
        "error13": '#13 Błędna playlista bądź brakujący/nieprawidłowy parser playlisty. Brak plików do odtworzenia.',
        "error20": '#20 Błędny lub uszkodzony parser.',
        "error80": '#80 Przepraszamy. Wideo nie może zostać odtworzone. Jeśli korzystasz z programów blokujących reklamy i/lub skrypty, wyłącz je, a następnie odśwież stronę i ponów próbę.',
        "error97": 'Brak multimediów do odtworzenia.',
        "error98": 'Błędne lub niespójne dane playlisty!',
        "error99": 'Kliknij ekran aby kontynuować.',
        "error100": 'Skróty klawiaturowe',

        "error200": 'Upłynął limit czasu żądania',

        // DRM errors
        "error300": "#300 Brak wsparcia dla systemów DRM użytych do zaszyfrowania tego pliku audio/video.",
        "error301": "#301 System DRM jest wymagadny do odtworzenia tego pliku lecz nie znaleziono konfiguracji dla serwera licencyjnego.",
        "error302": "#302 Licencja DRM nieprawidłowa bądź serwer licencyjny nie jest dostępny.",

        // youtube errors: 
        "error500": 'To wideo zostało usunięte albo zostało ustawione jako prywatne',
        "error501": 'Użytkownik Youtube będący właścicielem tego wideo wyłączył możliwość jego załączania na serwisach zewnętrznych.',
        "error502": 'Błędnie ustawione Youtube Video-Id.'
    };

}(window, document, jQuery, projekktor));