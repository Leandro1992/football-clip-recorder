# Raspberry Pi

A aplicação roda no Pi como um servidor Node headless (`apps/server`) que serve a UI React e uma API HTTP/SSE.

## Uso em campo

O celular não precisa achar o IP da quadra. O Raspberry publica a própria rede Wi-Fi.

1. No celular, entre na rede **Olho no lance** seguida de quatro caracteres (o final do MAC do aparelho). A senha inicial é `olhonolance`. Ela também aparece na aba Rede, depois do login, e no arquivo `/etc/olho-no-lance/access-point.env`.
2. Abra `http://192.168.4.1`. O login inicial é `admin` / `admin`. Troque `AUTH_USERNAME` e `AUTH_PASSWORD` no `.env` do aparelho.
3. A aba **Live** é a imagem para apontar a câmera. Ajuste o enquadramento olhando essa imagem.
4. A aba **Rede** escolhe o Wi-Fi da quadra. Os clipes sobem por essa rede. A rede do aparelho continua no ar.
5. Se o celular avisar que a rede não tem internet, mantenha a conexão. Isso acontece quando a quadra ainda não está configurada. Com a quadra conectada, o celular também navega por ela.

Enquanto o nome da máquina ainda for `raspberrypi`, o setup passa a chamá-la `olho-no-lance`. Na rede da quadra, se o roteador não isolar os aparelhos, `http://olho-no-lance.local` também abre a interface. O caminho que não depende do roteador é a rede do aparelho.

Para trocar a senha da rede do aparelho, edite `AP_PASSWORD` em `/etc/olho-no-lance/access-point.env` (8 a 63 letras, números, ponto, `_` ou `-`) e rode de novo `bash deploy/raspberry-pi/setup-access-point.sh`.

Se a rede do aparelho sumir, espere cerca de um minuto: o sistema tenta recriar o rádio. Se o Wi-Fi inteiro cair, reinicie o Raspberry. Este equipamento está no Raspberry Pi OS Trixie; o mesmo rádio faz a quadra e a rede do aparelho, e um defeito do firmware pode derrubar as duas até o timer recolocar o driver.

## Adaptadores

- `UsbCameraLinux` (v4l2 + ALSA opcional) no lugar de `UsbCameraWindows`.
- `GpioButton` (libgpiod/`gpiomon`) combinado ao `VirtualButton` da UI via `CompositeTriggerButton`.
- `S3Storage` via `STORAGE_PROVIDER=s3`; `MockStorage` mantém só os 5 clipes mais recentes.

## Instalação

```bash
git clone <url-do-repositorio> && cd football-clip-recorder
bash deploy/raspberry-pi/setup.sh
```

O script instala ffmpeg, v4l-utils, alsa-utils, gpiod e Node 20, cria `.env` a partir de `deploy/raspberry-pi/env.example`,
faz o build e registra o serviço systemd `football-clip-recorder`. Para atualizar pelo terminal: `bash deploy/raspberry-pi/update.sh` (git pull, npm install, build e restart do serviço). Pela interface, a aba **Controle de versão** consulta a `main` ao abrir e libera o botão Atualizar quando há commits novos. A câmera para só na troca final, por alguns segundos.

Logs: `journalctl -u football-clip-recorder -f`.

## Áudio

- Liste com `arecord -l` e use `AUDIO_DEVICE=plughw:<card>,<device>` (vazio = autodetecta o primeiro).
- `ENABLE_AUDIO=true` habilita. Se estiver baixo, use `AUDIO_GAIN_DB` (ex.: 20; há limitador contra distorção).
- `AUDIO_DENOISE=true` reduz ruído (passa-altas 100 Hz + `afftdn`), com custo pequeno de CPU.

## Botão físico

Defina `BUTTON_PROVIDER=gpio` e `GPIO_BUTTON_PIN` (linha GPIO). O botão liga o pino ao GND (pull-up interno, `GPIO_ACTIVE_LOW=true`).
Use `gpioinfo` para ver chips/linhas (no Pi 5 o chip pode ser `gpiochip4` em kernels antigos). O botão físico ainda não foi testado em hardware; a UI web sempre funciona.

## Desempenho

- A codificação é por software (`libx264 ultrafast`): no Pi 4, 1280x720@30 com `VIDEO_FORMAT=mjpeg` usa cerca de uma CPU.
- Reiniciar a câmera continua a numeração dos segmentos para não sobrescrever arquivos.

## Logs

Eventos por segmento (1/s) ficam ocultos; use `LOG_VERBOSE=true` para depurar. O `setup.sh` limita o journal a 100 MB (`SystemMaxUse`).

## Segurança

A interface abre numa tela de login simples (usuário e senha). Sem sessão, a API responde 401. O padrão de desenvolvimento é `admin` / `admin`; troque `AUTH_USERNAME` e `AUTH_PASSWORD` no `.env`. A senha é única do equipamento, então mantenha o Pi numa rede local confiável.
