APP_DIR=youtrack-escalation-app
ZIP_NAME=youtrack-escalation-app.zip

.PHONY: build clean

build:
	cd $(APP_DIR) && rm -f $(ZIP_NAME) && zip -r $(ZIP_NAME) manifest.json settings.json settings-handler.js widgets

clean:
	rm -f $(APP_DIR)/$(ZIP_NAME)