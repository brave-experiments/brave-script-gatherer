all: lambda
TMP_WORKSPACE := /tmp/brave-script-gatherer

lambda: clean
	rm -Rf $(TMP_WORKSPACE);
	mkdir $(TMP_WORKSPACE);
	cp -R * $(TMP_WORKSPACE)/;
	rm -Rf $(TMP_WORKSPACE)/node_modules/eslint;
	rm -Rf $(TMP_WORKSPACE)/node_modules/eslint-*;
	rm -Rf $(TMP_WORKSPACE)/node_modules/pluralize;
	rm -Rf $(TMP_WORKSPACE)/node_modules/regexpp;
	rm -Rf $(TMP_WORKSPACE)/node_modules/core-js/web;
	rm -Rf $(TMP_WORKSPACE)/node_modules/core-js/modules;
	rm -Rf $(TMP_WORKSPACE)/node_modules/core-js/fn;
	rm -Rf $(TMP_WORKSPACE)/node_modules/core-js/client;
	rm -Rf $(TMP_WORKSPACE)/node_modules/core-js/stage;
	rm -Rf $(TMP_WORKSPACE)/node_modules/nan;
	find $(TMP_WORKSPACE)/node_modules -type f -name "*.md" | xargs rm -Rf;
	find $(TMP_WORKSPACE)/node_modules -type d -name "test" | xargs rm -Rf;
	rm $(TMP_WORKSPACE)/Makefile;
	rm $(TMP_WORKSPACE)/*.json;
	find $(TMP_WORKSPACE)/node_modules -type d -name lodash -mindepth 3 | while read DIR; do \
		xargs rm -Rf "$$DIR"; \
		ln -s ../../lodash "$$DIR"; \
	done;
	cd $(TMP_WORKSPACE) && zip -r lambda.zip *;
	cp $(TMP_WORKSPACE)/lambda.zip lambda.zip;

clean:
	test -f lambda.zip && rm lambda.zip || echo "clean";
