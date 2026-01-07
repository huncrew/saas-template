PYTHON ?= python3.11
PIP ?= $(PYTHON) -m pip
LAMBDA_ROOT := lambdas/api
COMMON_DIR := lambdas/common
BUILD_DIR := .build
DIST_DIR := dist
LAMBDA_DIRS := $(shell find $(LAMBDA_ROOT) -mindepth 1 -maxdepth 1 -type d | sort)
LAMBDA_NAMES := $(notdir $(LAMBDA_DIRS))
ARCHIVES := $(patsubst %,$(DIST_DIR)/%.zip,$(LAMBDA_NAMES))

.PHONY: build clean test format lint

build: $(ARCHIVES)
	@echo "Build completed. Artifacts available in $(DIST_DIR)/"

$(DIST_DIR)/%.zip: $(LAMBDA_ROOT)/%/handler.py $(LAMBDA_ROOT)/%/requirements.txt
	@echo "Packaging lambda $*"
	@mkdir -p $(DIST_DIR)
	@rm -rf $(BUILD_DIR)/$*
	@mkdir -p $(BUILD_DIR)/$*
	@$(PIP) install --upgrade --requirement $(LAMBDA_ROOT)/$*/requirements.txt --target $(BUILD_DIR)/$* >/dev/null
	@rsync -a --exclude '__pycache__' $(COMMON_DIR)/ $(BUILD_DIR)/$*/common/
	@rsync -a --exclude '__pycache__' $(LAMBDA_ROOT)/$*/ $(BUILD_DIR)/$*/
	@cd $(BUILD_DIR)/$* && zip -qr ../../$@ .

clean:
	@rm -rf $(BUILD_DIR) $(DIST_DIR)

test:
	@$(PYTHON) -m pytest tests

format:
	@$(PYTHON) -m ruff check lambdas --fix
	@$(PYTHON) -m black lambdas tests

lint:
	@$(PYTHON) -m ruff check lambdas tests
