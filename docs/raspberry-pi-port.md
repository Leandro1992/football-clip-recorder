# Raspberry Pi

A aplicação roda no Pi como um servidor Node headless (`apps/server`) que serve a UI React e uma API HTTP/SSE.
Acesse pelo navegador em `http://<ip-do-pi>:3000`.

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
faz o build e registra o serviço systemd `football-clip-recorder`. Para atualizar: `bash deploy/raspberry-pi/update.sh` (git pull, npm install, build e restart do serviço).

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

## Segurança

A UI não tem autenticação: use apenas em rede local confiável.
