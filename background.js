// Al pulsar el icono de la barra se abre el panel de administración.
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
