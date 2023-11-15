ZIPFILE ?= eks-workshop-stack-app.zip
S3_ASSET_BUCKET ?= ws-assets-us-east-1
S3_ASSET_PREFIX ?= 02d7d511-9af8-417f-abda-3708e9c0c749/
S3_URL := s3://$(S3_ASSET_BUCKET)/$(S3_ASSET_PREFIX)$(ZIPFILE)

.PHONY: upload
upload: $(ZIPFILE)
	@echo Note: If this fails, ensure the proper AWS credentials are set in the environment. These can be found in the Event Engine module configuration.
	aws s3 cp $(ZIPFILE) $(S3_URL)

zip: $(ZIPFILE)

$(ZIPFILE): $(shell git ls-files)
	rm -f $@
	cd ../.. && git ls-files | xargs zip cdk/workshop/$@

.PHONY: clean
clean:
	rm -f $(ZIPFILE)
	find . -name '*.js' ! -name 'jest.config.js' -not -path './node_modules/*' -delete
	find . -name '*.d.ts' -not -path './node_modules/*' -delete
	rm -rf cdk.out/

.PHONY: build
build:
	npm run build

.PHONY: synth-bootstrap
synth-bootstrap: build
	npx cdk synth BootstrapStack

.PHONY: deploy
deploy: build upload
	npx cdk deploy BootstrapStack --require-approval=never \
		--previous-parameters=false \
		--parameters BootstrapStack:EEAssetsBucket=$(S3_ASSET_BUCKET) \
		--parameters BootstrapStack:EEAssetsKeyPrefix=$(S3_ASSET_PREFIX) \
		--parameters BootstrapStack:SourceZipFile=$(ZIPFILE) \
		--parameters BootstrapStack:SourceZipFileChecksum=$$(openssl sha256 -hex -r $(ZIPFILE) | cut -d' ' -f1)

.PHONY: destroy
destroy:
	npx cdk destroy BootstrapStack --force