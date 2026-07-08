# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-07-08T15:08:36.623Z
> Files: 518 tracked | Anatomy hits: 0 | Misses: 0

## ../../../.claude/plans/

- `imdi-benim-ayn-ekilde-eager-ember.md` — Plan: Scalp Bot — 5 İyileştirme (Paper-Trading, Backtest Rejimi, Ölçüm, Süre Metrikleri, Tie-Break) (~2287 tok)

## ./

- `.gitignore` — Git ignore rules (~55 tok)
- `CLAUDE.md` — OpenWolf (~57 tok)
- `docker-compose.yml` — Docker Compose services (~169 tok)
- `package-lock.json` — npm lock file (~30286 tok)
- `package.json` — Node.js package manifest (~329 tok)
- `vitest.config.js` — /*.test.js', 'services/**/*.test.js', 'packages/**/*.test.js'], (~67 tok)

## .claude/

- `settings.json` (~441 tok)

## .claude/rules/

- `openwolf.md` (~313 tok)

## .codegraph/

- `.gitignore` — Git ignore rules (~47 tok)
- `codegraph.db-shm` (~8739 tok)
- `daemon.log` (~4055 tok)
- `daemon.pid` (~42 tok)

## .logs/

- `frontend.log` (~50 tok)
- `service-ai.log` (~13 tok)
- `service-market-data.log` (~46196 tok)
- `service-signal-engine.log` — Declares signal_direction (~13390 tok)

## .superpowers/brainstorm/60771-1780346526/content/

- `layout-options.html` (~2945 tok)
- `signal-detail.html` (~2247 tok)
- `waiting.html` (~39 tok)

## .superpowers/brainstorm/60771-1780346526/state/

- `server-stopped` (~14 tok)
- `server.log` (~671 tok)
- `server.pid` (~2 tok)

## .superpowers/brainstorm/9679-1780554755/content/

- `card-mockup.html` (~1371 tok)
- `waiting.html` (~40 tok)

## .superpowers/brainstorm/9679-1780554755/state/

- `server-stopped` (~14 tok)
- `server.log` (~215 tok)
- `server.pid` (~2 tok)

## backtest-results/

- `.gitkeep` (~0 tok)
- `2026-06-01T07-15.json` (~197 tok)

## core/service-backtest/

- `package.json` — Node.js package manifest (~59 tok)

## core/service-backtest/src/domain/

- `reporter.js` — Exports calcMetrics, formatTable (~617 tok)
- `simulator.js` — Exports simulateTrade (~335 tok)

## core/service-backtest/src/infrastructure/

- `fetcher.js` — Exports fetchCandles, fetchFundingHistory, fetchOISnapshot, interpolateFunding (~908 tok)

## core/service-backtest/test/unit/

- `fetcher.test.js` — Declares candles (~572 tok)
- `reporter.test.js` — Declares sampleTrades (~474 tok)
- `simulator.test.js` — Declares candle (~542 tok)

## core/service-market-data/

- `package.json` — Node.js package manifest (~45 tok)

## core/service-market-data/src/application/use-cases/

- `make-publisher.js` — Exports makePublisher (~301 tok)

## core/service-market-data/src/infrastructure/persistence/repositories/

- `candle-repository.js` — Exports makeCandleRepository (~213 tok)

## core/service-market-data/test/unit/

- `candle-repository.test.js` — Declares candle (~540 tok)
- `make-publisher.test.js` — Declares candle (~500 tok)

## core/service-notifier/

- `package.json` — Node.js package manifest (~44 tok)

## core/service-notifier/src/domain/

- `formatter.js` — Exports formatEmailSubject, formatEmailHtml (~817 tok)

## core/service-notifier/src/infrastructure/

- `mailer.js` — Exports makeMailer (~129 tok)

## core/service-notifier/test/unit/

- `formatter.test.js` — Declares longSignal (~458 tok)
- `mailer.test.js` (~348 tok)

## core/service-signal-engine/

- `package.json` — Node.js package manifest (~63 tok)

## core/service-signal-engine/src/application/use-cases/

- `make-process-candle.js` — Exports makeProcessCandle (~2209 tok)

## core/service-signal-engine/src/domain/

- `confluence.js` — Exports adaptiveThreshold, calcConfluence (~1522 tok)
- `indicators.js` — Exports calcEMA, calcRSI, calcBollingerBands, calcATR + 6 more (~1587 tok)
- `liquidation-pressure.js` — Exports calcLiquidationPressure (~572 tok)
- `regime.js` — BTC trendine göre piyasa rejimini hesaplar (~395 tok)
- `setup-builder.js` — Exports applySRCap, buildSetup (~880 tok)

## core/service-signal-engine/src/infrastructure/persistence/repositories/

- `signal-repository.js` — Exports makeSignalRepository (~1591 tok)

## core/service-signal-engine/test/unit/

- `confluence.test.js` — ADX >= 25 ile güçlü trend fixture'ları (~1730 tok)
- `indicators.test.js` — Declares closes20 (~1726 tok)
- `liquidation-pressure.test.js` — Declares result (~764 tok)
- `regime.test.js` — Declares makeCandles (~383 tok)
- `setup-builder.test.js` — --- applySRCap testleri (değişmedi) --- (~1626 tok)
- `signal-repository.test.js` — Declares fakeRows (~261 tok)

## core/service-tracker/

- `package.json` — Node.js package manifest (~44 tok)

## core/service-tracker/src/application/use-cases/

- `make-process-outcome-candle.js` — Exports makeProcessOutcomeCandle (~648 tok)

## core/service-tracker/src/domain/

- `evaluate-outcome.js` — Açık bir outcome için mum OHLC'ye göre sonuç değerlendir. (~439 tok)

## core/service-tracker/test/unit/

- `evaluate-outcome.test.js` — Helper: candle oluştur (~745 tok)
- `make-process-outcome-candle.test.js` — Declares TIMEOUT_MS (~668 tok)

## db-schemas/

- `00-init.sql` (~138 tok)
- `01-config-watchlist.sql` — SQL: tables: watchlist, bot_config (~224 tok)
- `02-signals.sql` — SQL: tables: signals, signal_outcomes (~422 tok)

## db-schemas/migrations/

- `2026-07-08-01-paper-regime-tiebreak.sql` — Additive, idempotent migration: paper-trading, backtest regime parity, tie-break logging. (~173 tok)

## docs/

- `gateaway-ARCHITECTURE.md` — account-web-gateway — Sıfırdan Anlama Rehberi: Bir API Gateway'in Anatomisi (~6048 tok)
- `MONOREPO_STRUCTURE_EN.md` — 📂 tropiq‑mono‑repo – Full Folder & File Explanation (English) (~3265 tok)
- `MONOREPO_STRUCTURE.md` — 📂 tropiq‑mono‑repo – Tam Klasör & Dosya Açıklaması (~3404 tok)
- `WEB-APPARCHITECTURE.md` — account-web-app — Sıfırdan Anlama Rehberi: Bir React SPA'nın Anatomisi (~7065 tok)

## docs/superpowers/plans/

- `2026-05-31-scalp-bot-phase1a.md` — Scalp Bot — Faz 1A: Altyapı + Market Data + Signal Engine (~14691 tok)
- `2026-06-01-analiz-asistani.md` — Analiz Asistanı Implementation Plan (~12943 tok)
- `2026-06-01-service-backtest.md` — service-backtest Implementation Plan (~6934 tok)
- `2026-06-01-web-panel.md` — Web Panel (Faz 1E) Implementation Plan (~6549 tok)
- `2026-06-02-ai-service.md` — AI Service (Faz 1C) Implementation Plan (~5821 tok)
- `2026-06-04-email-notifier.md` — Email Notifier Implementation Plan (~2832 tok)
- `2026-06-04-telegram-notifier.md` — Telegram Notifier Implementation Plan (~2900 tok)

## docs/superpowers/specs/

- `2026-06-01-analiz-asistani-design.md` — Analiz Asistanı — Design Spec (~1684 tok)
- `2026-06-01-backtest-design.md` — Faz 1B — service-backtest Tasarım Spec'i (~1190 tok)
- `2026-06-02-ai-service-design.md` — AI Service (Faz 1C) — Design Spec (~1119 tok)

## packages/modules/config/

- `index.js` — 12factor-style config loader. (~239 tok)
- `package.json` — Node.js package manifest (~28 tok)

## packages/modules/datasource/

- `index.js` — Exports createDatasources (~175 tok)
- `package.json` — Node.js package manifest (~50 tok)

## packages/modules/datasource/connectors/

- `postgre.js` — Exports createPostgresPool (~96 tok)
- `redis.js` — Exports createRedisConnection (~162 tok)

## packages/modules/helper/

- `index.js` — timestamp: exitOnError, appStarted (~202 tok)
- `package.json` — Node.js package manifest (~28 tok)

## packages/modules/service-discovery/

- `index.js` — API routes: GET (1 endpoints) (~285 tok)
- `package.json` — Node.js package manifest (~32 tok)

## services/service-ai/

- `main.py` — API: GET, POST (2 endpoints) (~260 tok)
- `ollama_client.py` — generate (~171 tok)
- `prompt.py` — build_prompt (~817 tok)
- `requirements.txt` — Python dependencies (~21 tok)
- `test_analyze.py` — Tests: analyze_returns_comment_when_ollama_ok, analyze_returns_null_when_ollama_fails, health (~572 tok)
- `test_prompt.py` — Tests: prompt_contains_symbol, prompt_contains_direction, prompt_contains_prices, prompt_contains_rsi + 3 more (~415 tok)

## services/service-ai/.pytest_cache/

- `.gitignore` — Git ignore rules (~10 tok)
- `CACHEDIR.TAG` (~51 tok)
- `README.md` — Project documentation (~76 tok)

## services/service-ai/.pytest_cache/v/cache/

- `lastfailed` (~1 tok)
- `nodeids` (~140 tok)
- `stepwise` (~1 tok)

## services/service-ai/.venv/

- `.gitignore` — Git ignore rules (~19 tok)
- `pyvenv.cfg` (~93 tok)

## services/service-ai/.venv/bin/

- `activate` — This file must be used with "source bin/activate" *from bash* (~604 tok)
- `activate.csh` — This file must be used with "source bin/activate.csh" *from csh*. (~258 tok)
- `activate.fish` — This file must be used with "source <venv>/bin/activate.fish" *from fish* (~597 tok)
- `Activate.ps1` — Declares from (~2409 tok)
- `dotenv` (~63 tok)
- `email_validator` (~66 tok)
- `httpx` (~61 tok)
- `idna` (~62 tok)
- `markdown-it` (~65 tok)
- `pip` (~65 tok)
- `pip3` (~65 tok)
- `pip3.13` (~65 tok)
- `py.test` (~65 tok)
- `pygmentize` (~64 tok)
- `pytest` (~65 tok)
- `typer` (~62 tok)
- `uvicorn` (~63 tok)
- `watchfiles` (~63 tok)
- `websockets` (~63 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/

- `py.py` — shim for pylib going away (~84 tok)
- `typing_extensions.py` — _Sentinel: final, done, done, disjoint_base + 1 more (~45837 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/_pytest/

- `__init__.py` (~102 tok)
- `_argcomplete.py` — Allow bash-completion for argparse with argcomplete if installed. (~1085 tok)
- `_version.py` — file generated by setuptools_scm (~118 tok)
- `cacheprovider.py` — Implementation of the cache provider. (~6412 tok)
- `capture.py` — Per-test stdout/stderr capturing mechanism. (~9964 tok)
- `compat.py` — Python version compatibility code. (~3277 tok)
- `debugging.py` — Interactive debugging with PDB, the Python Debugger. (~3842 tok)
- `deprecated.py` — Deprecation messages and bits of code used elsewhere in the codebase that (~889 tok)
- `doctest.py` — Discover and run doctests in modules and test files. (~7444 tok)
- `faulthandler.py` — pytest_addoption, pytest_configure, pytest_unconfigure, get_stderr_fileno + 4 more (~1028 tok)
- `fixtures.py` — mypy: allow-untyped-defs (~20848 tok)
- `freeze_support.py` — Provides a function to report all internal modules for using freezing (~375 tok)
- `helpconfig.py` — Version info, help messages, tracing configuration. (~2497 tok)
- `hookspec.py` — Hook specifications for pytest plugins which are invoked by pytest itself (~12146 tok)
- `junitxml.py` — Report test results in JUnit-XML format, for use with Jenkins and build (~7332 tok)
- `legacypath.py` — Add backward compatibility support for the legacy py path type. (~4827 tok)
- `logging.py` — Access and control log capturing. (~10109 tok)
- `main.py` — Core implementation of the testing process: init, session, runtest loop. (~10728 tok)
- `monkeypatch.py` — Monkeypatching and mocking functionality. (~4210 tok)
- `nodes.py` — mypy: allow-untyped-defs (~7631 tok)
- `outcomes.py` — Exception classes and constants handling test outcomes as well as (~3015 tok)
- `pastebin.py` — Submit failure or test session information to a pastebin service. (~1137 tok)
- `pathlib.py` — URL patterns: 1 routes (~9770 tok)
- `py.typed` (~0 tok)
- `pytester_assertions.py` — Helper plugin for pytester; should not be loaded on its own. (~666 tok)
- `pytester.py` — (Disabled by default) support for testing pytest and pytest plugins. (~17710 tok)
- `python_api.py` — mypy: allow-untyped-defs (~11224 tok)
- `python_path.py` — pytest_addoption, pytest_load_initial_conftests, pytest_unconfigure (~203 tok)
- `python.py` — Python test discovery, setup and run of test functions. (~18598 tok)
- `recwarn.py` — Record warnings during test function execution. (~3877 tok)
- `reports.py` — mypy: allow-untyped-defs (~5972 tok)
- `runner.py` — Basic collect and runtest protocol implementations. (~5500 tok)
- `scope.py` — Scope: next_lower, next_higher, from_user (~801 tok)
- `setuponly.py` — pytest_addoption, pytest_fixture_setup, pytest_fixture_post_finalizer, pytest_cmdline_main (~952 tok)
- `setupplan.py` — pytest_addoption, pytest_fixture_setup, pytest_cmdline_main (~347 tok)
- `skipping.py` — Support for skip/xfail functions and markers. (~2930 tok)
- `stash.py` — View: get (~889 tok)
- `stepwise.py` — StepwisePlugin: pytest_addoption, pytest_configure, pytest_sessionfinish, pytest_sessionstart + 4 more (~1347 tok)
- `terminal.py` — Terminal reporting of the full testing process. (~15703 tok)
- `threadexception.py` — Copied from cpython/Lib/test/support/threading_helper.py, with modifications. (~864 tok)
- `timing.py` — Indirection for time functions. (~108 tok)
- `tmpdir.py` — Support for providing temporary directories to test functions. (~3352 tok)
- `unittest.py` — Discover and run std-library "unittest" style tests. (~4440 tok)
- `unraisableexception.py` — Copied from cpython/Lib/test/support/__init__.py, with modifications. (~934 tok)
- `warning_types.py` — PytestWarning: simple, format, warn_explicit_for (~1252 tok)
- `warnings.py` — mypy: allow-untyped-defs (~1502 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/_pytest/_code/

- `__init__.py` — Python inspection/code generation API. (~139 tok)
- `code.py` — mypy: allow-untyped-defs (~14292 tok)
- `source.py` — mypy: allow-untyped-defs (~2109 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/_pytest/_io/

- `__init__.py` (~44 tok)
- `pprint.py` — mypy: allow-untyped-defs (~5619 tok)
- `saferepr.py` — SafeRepr: repr, repr_instance, safeformat, saferepr + 1 more (~1163 tok)
- `terminalwriter.py` — Helper functions for writing to terminals and files. (~2551 tok)
- `wcwidth.py` — wcwidth, wcswidth (~358 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/_pytest/_py/

- `__init__.py` (~0 tok)
- `error.py` — create errno-specific classes for IO or os calls. (~862 tok)
- `path.py` — local path implementation. (~14076 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/_pytest/assertion/

- `__init__.py` — Support for presenting detailed information in failing assertions. (~1949 tok)
- `rewrite.py` — .py" for example) we can't bail out based (~13498 tok)
- `truncate.py` — Utilities for truncating assertion output. (~1282 tok)
- `util.py` — Utilities for assertion debugging. (~5802 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/_pytest/config/

- `__init__.py` — Command line options, ini-file and conftest.py processing. (~20085 tok)
- `argparsing.py` — mypy: allow-untyped-defs (~5918 tok)
- `compat.py` — URL configuration (~840 tok)
- `exceptions.py` — Declares UsageError (~72 tok)
- `findpaths.py` — URL configuration (~2344 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/_pytest/mark/

- `__init__.py` — Generic mechanism for marking and selecting python functions. (~2497 tok)
- `expression.py` — TokenType: lex, accept, reject, expression + 5 more (~1824 tok)
- `structures.py` — mypy: allow-untyped-defs (~6124 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/_yaml/

- `__init__.py` — This is a stub package designed to roughly emulate the _yaml (~401 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/annotated_doc-0.0.4.dist-info/

- `entry_points.txt` (~9 tok)
- `INSTALLER` (~2 tok)
- `METADATA` — Declares attributes (~1751 tok)
- `RECORD` (~232 tok)
- `WHEEL` (~24 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/annotated_doc-0.0.4.dist-info/licenses/

- `LICENSE` — Project license (~290 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/annotated_doc/

- `__init__.py` (~15 tok)
- `main.py` — Doc: hi (~308 tok)
- `py.typed` (~0 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/annotated_types-0.7.0.dist-info/

- `INSTALLER` (~2 tok)
- `METADATA` — Declares MyClass (~4013 tok)
- `RECORD` (~214 tok)
- `WHEEL` (~24 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/annotated_types-0.7.0.dist-info/licenses/

- `LICENSE` — Project license (~289 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/annotated_types/

- `__init__.py` — Declares from (~3949 tok)
- `py.typed` (~0 tok)
- `test_cases.py` — Test file (~1834 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/anyio-4.13.0.dist-info/

- `entry_points.txt` (~10 tok)
- `INSTALLER` (~2 tok)
- `METADATA` (~1203 tok)
- `RECORD` (~1669 tok)
- `top_level.txt` (~2 tok)
- `WHEEL` (~25 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/anyio-4.13.0.dist-info/licenses/

- `LICENSE` — Project license (~288 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/anyio/

- `__init__.py` — Declares as (~1763 tok)
- `from_thread.py` — _BlockingAsyncContextManager: run, run_sync, run_async_cm, started + 9 more (~5469 tok)
- `functools.py` — _InitialMissingType: cache_info, cache_parameters, cache_clear, cache_info + 12 more (~3451 tok)
- `lowlevel.py` — View: get, get, get (~1474 tok)
- `py.typed` (~0 tok)
- `pytest_plugin.py` — FreePortFactory: extract_backend_and_options, get_runner, pytest_addoption, pytest_configure + 10 more (~3650 tok)
- `to_interpreter.py` — _Worker: destroy, call, destroy, call + 4 more (~2029 tok)
- `to_process.py` — from: run_sync, send_raw_command, current_default_process_limiter, process_worker (~2800 tok)
- `to_thread.py` — run_sync, current_default_thread_limiter (~770 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/anyio/_backends/

- `__init__.py` (~0 tok)
- `_asyncio.py` — _State: close, get_loop, run, find_root_task + 2 more (~28422 tok)
- `_trio.py` — from: cancel, deadline, deadline, cancel_called + 25 more (~11819 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/anyio/_core/

- `__init__.py` (~0 tok)
- `_asyncio_selector_thread.py` — Selector: start, add_reader, add_writer, remove_reader + 3 more (~1608 tok)
- `_contextmanagers.py` — Declares _SupportsCtxMgr (~2062 tok)
- `_eventloop.py` — because: run, sleep, sleep_forever, sleep_until + 9 more (~1842 tok)
- `_exceptions.py` — BrokenResourceError: iterate_exceptions (~1260 tok)
- `_fileio.py` — from: wrapped, aclose, read, read1 + 35 more (~7333 tok)
- `_resources.py` — aclose_forcefully (~125 tok)
- `_signals.py` — open_signal_receiver (~291 tok)
- `_sockets.py` — URL configuration (~9992 tok)
- `_streams.py` — Declares create_memory_object_stream (~516 tok)
- `_subprocesses.py` — run_process, drain_stream, open_process (~2262 tok)
- `_synchronization.py` — from: set, is_set, wait, statistics + 29 more (~6018 tok)
- `_tasks.py` — _IgnoredTaskStatus: started, cancel, deadline, deadline + 8 more (~1553 tok)
- `_tempfile.py` — TemporaryFile: aclose, rollover, closed, read + 6 more (~5607 tok)
- `_testing.py` — TaskInfo: has_pending_cancellation, get_current_task, get_running_tasks, wait_all_tasks_blocked (~669 tok)
- `_typedattr.py` — TypedAttributeSet: typed_attribute, extra_attributes, extra, extra + 1 more (~717 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/anyio/abc/

- `__init__.py` (~820 tok)
- `_eventloop.py` — AsyncBackend: run, current_token, current_time, cancelled_exception_class + 43 more (~3037 tok)
- `_resources.py` — AsyncResource: aclose (~224 tok)
- `_sockets.py` — SocketAttribute: extra_attributes, from_socket, from_socket, send_fds + 9 more (~3750 tok)
- `_streams.py` — UnreliableObjectReceiveStream: receive, send, send_eof, receive + 5 more (~2138 tok)
- `_subprocesses.py` — Process: wait, terminate, kill, send_signal + 5 more (~591 tok)
- `_tasks.py` — TaskStatus: started, started, started, start_soon + 1 more (~1064 tok)
- `_testing.py` — TestRunner: run_asyncgen_fixture, run_fixture, run_test (~521 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/anyio/streams/

- `__init__.py` (~0 tok)
- `buffered.py` — BufferedByteReceiveStream: aclose, buffer, extra_attributes, feed_data + 6 more (~1790 tok)
- `file.py` — URL configuration (~1266 tok)
- `memory.py` — MemoryObjectStreamStatistics: statistics, receive_nowait, receive, clone + 9 more (~3069 tok)
- `stapled.py` — from: receive, send, send_eof, aclose + 9 more (~1255 tok)
- `text.py` — TextReceiveStream: receive, aclose, extra_attributes, send + 8 more (~1648 tok)
- `tls.py` — from: wrap, unwrap, aclose, receive + 4 more (~4373 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/certifi-2026.5.20.dist-info/

- `INSTALLER` (~2 tok)
- `METADATA` (~660 tok)
- `RECORD` (~273 tok)
- `top_level.txt` (~2 tok)
- `WHEEL` (~25 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/certifi-2026.5.20.dist-info/licenses/

- `LICENSE` — Project license (~264 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/certifi/

- `__init__.py` (~27 tok)
- `__main__.py` (~70 tok)
- `cacert.pem` — Issuer: CN=COMODO ECC Certification Authority O=COMODO CA Limited (~62959 tok)
- `core.py` — URL patterns: 3 routes (~970 tok)
- `py.typed` (~0 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/click-8.4.1.dist-info/

- `INSTALLER` (~2 tok)
- `METADATA` — Declares toolkit (~699 tok)
- `RECORD` (~676 tok)
- `WHEEL` (~22 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/click-8.4.1.dist-info/licenses/

- `LICENSE.txt` (~369 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/click/

- `__init__.py` (~1324 tok)
- `_compat.py` — URL configuration (~5403 tok)
- `_termui_impl.py` — _BufferedTextPagerStream: render_finish, pct, time_per_iteration, eta + 10 more (~8689 tok)
- `_textwrap.py` — TextWrapper: extra_indent, indent_only (~1792 tok)
- `_utils.py` — Declares import (~285 tok)
- `_winconsole.py` — This module is based on the excellent work by Adam Bartoš who (~2441 tok)
- `core.py` — ParameterSource: batch, augment_usage_errors, iter_params_for_processing, sort_key (~39405 tok)
- `decorators.py` — to: pass_context, new_func, pass_obj, new_func + 24 more (~5277 tok)
- `exceptions.py` — ClickException: format_message, show, show, format_message + 5 more (~3227 tok)
- `formatting.py` — Can force a width.  This is used by the test system (~2963 tok)
- `globals.py` — get_current_context, get_current_context, get_current_context, push_context + 2 more (~550 tok)
- `parser.py` — _Option: takes_value, process, process, add_option + 2 more (~5444 tok)
- `py.typed` (~0 tok)
- `shell_completion.py` — CompletionItem: shell_complete, func_name, source_vars, source + 9 more (~6214 tok)
- `termui.py` — hidden_prompt_func, prompt, prompt_func, confirm + 4 more (~9429 tok)
- `testing.py` — EchoingStdin: read, read1, readline, readlines + 15 more (~7348 tok)
- `types.py` — ParamTypeInfoDict: to_info_dict, get_metavar, get_missing_message, convert + 12 more (~12224 tok)
- `utils.py` — URL configuration (~5824 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/dns/

- `__init__.py` — Permission to use, copy, modify, and distribute this software and its (~484 tok)
- `_asyncbackend.py` — This is a nullcontext for both sync and async.  3.7 has a nullcontext, (~687 tok)
- `_asyncio_backend.py` — asyncio library query support (~2614 tok)
- `_ddr.py` — Support for Discovery of Designated Resolvers (~1500 tok)
- `_features.py` — have, force (~713 tok)
- `_immutable_ctx.py` — This implementation of the immutable decorator requires python >= (~708 tok)
- `_no_ssl.py` — TLSVersion: wrap_socket, set_alpn_protocols, pending, do_handshake + 3 more (~430 tok)
- `_tls_util.py` — URL configuration (~151 tok)
- `_trio_backend.py` — trio async I/O library query support (~2457 tok)
- `asyncbackend.py` — pylint: disable=unused-import (~799 tok)
- `asyncquery.py` — Permission to use, copy, modify, and distribute this software and its (~9237 tok)
- `asyncresolver.py` — Permission to use, copy, modify, and distribute this software and its (~5066 tok)
- `btree.py` — View: get, delete (~8788 tok)
- `btreezone.py` — A derivative of a dnspython VersionedZone and related classes, using a BTreeDict and (~3738 tok)
- `dnssec.py` — Permission to use, copy, modify, and distribute this software and its (~11816 tok)
- `dnssectypes.py` — Permission to use, copy, modify, and distribute this software and its (~514 tok)
- `e164.py` — Permission to use, copy, modify, and distribute this software and its (~1125 tok)
- `edns.py` — Permission to use, copy, modify, and distribute this software and its (~4982 tok)
- `entropy.py` — Permission to use, copy, modify, and distribute this software and its (~1214 tok)
- `enum.py` — Permission to use, copy, modify, and distribute this software and its (~1053 tok)
- `exception.py` — Permission to use, copy, modify, and distribute this software and its (~1696 tok)
- `flags.py` — Permission to use, copy, modify, and distribute this software and its (~786 tok)
- `grange.py` — Permission to use, copy, modify, and distribute this software and its (~616 tok)
- `immutable.py` — Dict: constify (~577 tok)
- `inet.py` — Permission to use, copy, modify, and distribute this software and its (~1644 tok)
- `ipv4.py` — Permission to use, copy, modify, and distribute this software and its (~711 tok)
- `ipv6.py` — Permission to use, copy, modify, and distribute this software and its (~1862 tok)
- `message.py` — Permission to use, copy, modify, and distribute this software and its (~19758 tok)
- `name.py` — Permission to use, copy, modify, and distribute this software and its (~12260 tok)
- `namedict.py` — Permission to use, copy, modify, and distribute this software and its (~1143 tok)
- `nameserver.py` — Nameserver: kind, is_always_max_size, answer_nameserver, answer_port + 21 more (~2860 tok)
- `node.py` — Permission to use, copy, modify, and distribute this software and its (~3608 tok)
- `opcode.py` — Permission to use, copy, modify, and distribute this software and its (~793 tok)
- `py.typed` (~0 tok)
- `query.py` — Permission to use, copy, modify, and distribute this software and its (~17625 tok)
- `rcode.py` — Permission to use, copy, modify, and distribute this software and its (~1195 tok)
- `rdata.py` — Permission to use, copy, modify, and distribute this software and its (~9137 tok)
- `rdataclass.py` — Permission to use, copy, modify, and distribute this software and its (~853 tok)
- `rdataset.py` — Permission to use, copy, modify, and distribute this software and its (~4751 tok)
- `rdatatype.py` — Permission to use, copy, modify, and distribute this software and its (~2140 tok)
- `renderer.py` — Permission to use, copy, modify, and distribute this software and its (~3286 tok)
- `resolver.py` — Permission to use, copy, modify, and distribute this software and its (~21134 tok)
- `reversename.py` — Permission to use, copy, modify, and distribute this software and its (~1099 tok)
- `rrset.py` — Permission to use, copy, modify, and distribute this software and its (~2609 tok)
- `serial.py` — Serial Number Arthimetic from RFC 1982 (~1031 tok)
- `set.py` — Permission to use, copy, modify, and distribute this software and its (~2633 tok)
- `tokenizer.py` — Permission to use, copy, modify, and distribute this software and its (~6712 tok)
- `transaction.py` — import: reader, writer, origin_information, get_class + 17 more (~6452 tok)
- `tsig.py` — Permission to use, copy, modify, and distribute this software and its (~3308 tok)
- `tsigkeyring.py` — Permission to use, copy, modify, and distribute this software and its (~758 tok)
- `ttl.py` — Permission to use, copy, modify, and distribute this software and its (~840 tok)
- `update.py` — Permission to use, copy, modify, and distribute this software and its (~3496 tok)
- `version.py` — Permission to use, copy, modify, and distribute this software and its (~504 tok)
- `versioned.py` — DNS Versioned Zones. (~3384 tok)
- `win32util.py` — pylint: disable=W0612,W0613,C0301 (~4800 tok)
- `wire.py` — Parser: remaining, get_bytes, get_counted_bytes, get_remaining + 9 more (~902 tok)
- `xfr.py` — Permission to use, copy, modify, and distribute this software and its (~3897 tok)
- `zone.py` — Permission to use, copy, modify, and distribute this software and its (~15171 tok)
- `zonefile.py` — Permission to use, copy, modify, and distribute this software and its (~8148 tok)
- `zonetypes.py` — Common zone-related types. (~198 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/dns/dnssecalgs/

- `__init__.py` — pyright: reportPossiblyUnboundVariable=false (~1243 tok)
- `base.py` — import: verify, encode_key_bytes, to_dnskey, from_dnskey + 6 more (~714 tok)
- `cryptography.py` — CryptographyPublicKey: from_pem, to_pem, public_key, from_pem + 1 more (~694 tok)
- `dsa.py` — PublicDSA: verify, encode_key_bytes, from_dnskey, sign + 1 more (~1030 tok)
- `ecdsa.py` — PublicECDSA: verify, encode_key_bytes, from_dnskey, sign + 1 more (~938 tok)
- `eddsa.py` — PublicEDDSA: verify, encode_key_bytes, from_dnskey, sign + 1 more (~572 tok)
- `rsa.py` — PublicRSA: verify, encode_key_bytes, from_dnskey, sign + 1 more (~1047 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/dns/quic/

- `__init__.py` — AsyncQuicStream: null_factory, factories_for_backend, make_stream, make_stream (~736 tok)
- `_asyncio.py` — AsyncioQuicStream: wait_for, wait_for_end, receive, send + 6 more (~2947 tok)
- `_common.py` — View: put, get (~3168 tok)
- `_sync.py` — SyncQuicStream: wait_for, wait_for_end, receive, send + 12 more (~3138 tok)
- `_trio.py` — TrioQuicStream: wait_for, wait_for_end, receive, send + 6 more (~2701 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/dns/rdtypes/

- `__init__.py` — Permission to use, copy, modify, and distribute this software and its (~307 tok)
- `dnskeybase.py` — Permission to use, copy, modify, and distribute this software and its (~807 tok)
- `dsbase.py` — Permission to use, copy, modify, and distribute this software and its (~978 tok)
- `euibase.py` — Author: Petr Spacek <pspacek@redhat.com> (~765 tok)
- `mxbase.py` — Permission to use, copy, modify, and distribute this software and its (~912 tok)
- `nsbase.py` — Permission to use, copy, modify, and distribute this software and its (~664 tok)
- `svcbbase.py` — UnknownParamKey: key_to_text, emptiness, emptiness, from_value + 37 more (~5062 tok)
- `tlsabase.py` — Permission to use, copy, modify, and distribute this software and its (~740 tok)
- `txtbase.py` — Permission to use, copy, modify, and distribute this software and its (~1064 tok)
- `util.py` — Permission to use, copy, modify, and distribute this software and its (~2766 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/dns/rdtypes/ANY/

- `__init__.py` — Permission to use, copy, modify, and distribute this software and its (~440 tok)
- `AFSDB.py` — Permission to use, copy, modify, and distribute this software and its (~475 tok)
- `AMTRELAY.py` — Permission to use, copy, modify, and distribute this software and its (~959 tok)
- `AVC.py` — Permission to use, copy, modify, and distribute this software and its (~293 tok)
- `CAA.py` — Permission to use, copy, modify, and distribute this software and its (~702 tok)
- `CDNSKEY.py` — Permission to use, copy, modify, and distribute this software and its (~350 tok)
- `CDS.py` — Permission to use, copy, modify, and distribute this software and its (~333 tok)
- `CERT.py` — Permission to use, copy, modify, and distribute this software and its (~1014 tok)
- `CNAME.py` — Permission to use, copy, modify, and distribute this software and its (~345 tok)
- `CSYNC.py` — Permission to use, copy, modify, and distribute this software and its (~695 tok)
- `DLV.py` — Permission to use, copy, modify, and distribute this software and its (~282 tok)
- `DNAME.py` — Permission to use, copy, modify, and distribute this software and its (~329 tok)
- `DNSKEY.py` — Permission to use, copy, modify, and distribute this software and its (~350 tok)
- `DS.py` — Permission to use, copy, modify, and distribute this software and its (~285 tok)
- `DSYNC.py` — UnknownScheme: to_text, from_text, from_wire_parser (~616 tok)
- `EUI48.py` — Author: Petr Spacek <pspacek@redhat.com> (~329 tok)
- `EUI64.py` — Author: Petr Spacek <pspacek@redhat.com> (~332 tok)
- `GPOS.py` — Permission to use, copy, modify, and distribute this software and its (~1269 tok)
- `HINFO.py` — Permission to use, copy, modify, and distribute this software and its (~634 tok)
- `HIP.py` — Permission to use, copy, modify, and distribute this software and its (~919 tok)
- `ISDN.py` — Permission to use, copy, modify, and distribute this software and its (~778 tok)
- `L32.py` — L32: to_text, from_text, from_wire_parser (~372 tok)
- `L64.py` — L64: to_text, from_text, from_wire_parser (~460 tok)
- `LOC.py` — Permission to use, copy, modify, and distribute this software and its (~3418 tok)
- `LP.py` — LP: to_text, from_text, from_wire_parser (~381 tok)
- `MX.py` — Permission to use, copy, modify, and distribute this software and its (~285 tok)
- `NID.py` — NID: to_text, from_text, from_wire_parser (~446 tok)
- `NINFO.py` — Permission to use, copy, modify, and distribute this software and its (~298 tok)
- `NS.py` — Permission to use, copy, modify, and distribute this software and its (~285 tok)
- `NSEC.py` — Permission to use, copy, modify, and distribute this software and its (~705 tok)
- `NSEC3.py` — Permission to use, copy, modify, and distribute this software and its (~1215 tok)
- `NSEC3PARAM.py` — Permission to use, copy, modify, and distribute this software and its (~750 tok)
- `OPENPGPKEY.py` — Permission to use, copy, modify, and distribute this software and its (~535 tok)
- `OPT.py` — Permission to use, copy, modify, and distribute this software and its (~732 tok)
- `PTR.py` — Permission to use, copy, modify, and distribute this software and its (~285 tok)
- `RESINFO.py` — Permission to use, copy, modify, and distribute this software and its (~288 tok)
- `RP.py` — Permission to use, copy, modify, and distribute this software and its (~622 tok)
- `RRSIG.py` — Permission to use, copy, modify, and distribute this software and its (~1412 tok)
- `RT.py` — Permission to use, copy, modify, and distribute this software and its (~290 tok)
- `SMIMEA.py` — Declares SMIMEA (~64 tok)
- `SOA.py` — Permission to use, copy, modify, and distribute this software and its (~867 tok)
- `SPF.py` — Permission to use, copy, modify, and distribute this software and its (~292 tok)
- `SSHFP.py` — Permission to use, copy, modify, and distribute this software and its (~729 tok)
- `TKEY.py` — Permission to use, copy, modify, and distribute this software and its (~1386 tok)
- `TLSA.py` — Declares TLSA (~63 tok)
- `TSIG.py` — Permission to use, copy, modify, and distribute this software and its (~1358 tok)
- `TXT.py` — Permission to use, copy, modify, and distribute this software and its (~286 tok)
- `URI.py` — Permission to use, copy, modify, and distribute this software and its (~833 tok)
- `WALLET.py` — Declares WALLET (~63 tok)
- `X25.py` — Permission to use, copy, modify, and distribute this software and its (~555 tok)
- `ZONEMD.py` — ZONEMD: to_text, from_text, from_wire_parser (~683 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/dns/rdtypes/CH/

- `__init__.py` — Permission to use, copy, modify, and distribute this software and its (~264 tok)
- `A.py` — Permission to use, copy, modify, and distribute this software and its (~637 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/dns/rdtypes/IN/

- `__init__.py` — Permission to use, copy, modify, and distribute this software and its (~310 tok)
- `A.py` — Permission to use, copy, modify, and distribute this software and its (~519 tok)
- `AAAA.py` — Permission to use, copy, modify, and distribute this software and its (~520 tok)
- `APL.py` — Permission to use, copy, modify, and distribute this software and its (~1452 tok)
- `DHCID.py` — Permission to use, copy, modify, and distribute this software and its (~536 tok)
- `HTTPS.py` — Declares HTTPS (~63 tok)
- `IPSECKEY.py` — Permission to use, copy, modify, and distribute this software and its (~932 tok)
- `KX.py` — Permission to use, copy, modify, and distribute this software and its (~290 tok)
- `NAPTR.py` — Permission to use, copy, modify, and distribute this software and its (~1069 tok)
- `NSAP_PTR.py` — Permission to use, copy, modify, and distribute this software and its (~290 tok)
- `NSAP.py` — Permission to use, copy, modify, and distribute this software and its (~618 tok)
- `PX.py` — Permission to use, copy, modify, and distribute this software and its (~786 tok)
- `SRV.py` — Permission to use, copy, modify, and distribute this software and its (~789 tok)
- `SVCB.py` — Declares SVCB (~63 tok)
- `WKS.py` — Permission to use, copy, modify, and distribute this software and its (~1042 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/dnspython-2.8.0.dist-info/

- `INSTALLER` (~2 tok)
- `METADATA` (~1515 tok)
- `RECORD` (~5135 tok)
- `WHEEL` (~24 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/dnspython-2.8.0.dist-info/licenses/

- `LICENSE` — Project license (~407 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/dotenv/

- `__init__.py` — load_ipython_extension, get_cli_string (~352 tok)
- `__main__.py` — Entry point for cli, enables execution with `python -m dotenv` (~37 tok)
- `cli.py` — enumerate_env, cli, stream_file, list_values + 5 more (~1870 tok)
- `ipython.py` — class: dotenv, load_ipython_extension (~379 tok)
- `main.py` — A type alias for a string path to be used for the paths in this file. (~4196 tok)
- `parser.py` — Original: make_regex, start, set, advance + 13 more (~1480 tok)
- `py.typed` — Marker file for PEP 561 (~7 tok)
- `variables.py` — Atom: resolve, resolve, resolve, parse_variables (~671 tok)
- `version.py` (~7 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/email_validator-2.3.0.dist-info/

- `entry_points.txt` (~17 tok)
- `INSTALLER` (~2 tok)
- `METADATA` — Declares annotations (~6926 tok)
- `RECORD` (~560 tok)
- `top_level.txt` (~4 tok)
- `WHEEL` (~25 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/email_validator-2.3.0.dist-info/licenses/

- `LICENSE` — Project license (~324 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/email_validator/

- `__init__.py` — Export the main method, helper methods, and the public data types. (~1252 tok)
- `__main__.py` — A command-line tool for testing. (~658 tok)
- `deliverability.py` — caching_resolver, validate_email_deliverability, is_global_addr (~2062 tok)
- `exceptions.py` — Declares EmailNotValidError (~124 tok)
- `py.typed` (~0 tok)
- `rfc_constants.py` — These constants are defined by the email specifications. (~984 tok)
- `syntax.py` — LocalPartValidationResult: split_email, split_string_at_unquoted_special, unquote_quoted_string, get_length_reason + 2 more (~11133 tok)
- `types.py` — ValidatedEmail: email, as_constructor, as_dict (~1597 tok)
- `validate_email.py` — validate_email (~2837 tok)
- `version.py` (~7 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/fastapi/

- `__init__.py` — FastAPI framework, high performance, easy to learn, fast to code, ready for production (~309 tok)
- `_compat.py` — from: alias, required, default, type_ + 16 more (~6610 tok)
- `applications.py` — API: GET (2 endpoints) (~50383 tok)
- `background.py` — API: POST (1 endpoints) (~506 tok)
- `concurrency.py` — contextmanager_in_threadpool (~401 tok)
- `datastructures.py` — API: POST (2 endpoints) (~1648 tok)
- `encoders.py` — isoformat, decimal_encoder, generate_encoders_by_class_tuples, jsonable_encoder (~3163 tok)
- `exception_handlers.py` — http_exception_handler, request_validation_exception_handler, websocket_request_validation_exception_handler (~381 tok)
- `exceptions.py` — API: GET (1 endpoints) (~1420 tok)
- `logger.py` (~16 tok)
- `param_functions.py` — API: GET (1 endpoints) (~18288 tok)
- `params.py` — Declares import (~8055 tok)
- `py.typed` (~0 tok)
- `requests.py` (~41 tok)
- `responses.py` — UJSONResponse: render, render (~504 tok)
- `routing.py` — async: serialize_response, run_endpoint_function, get_request_handler, app (~49758 tok)
- `staticfiles.py` (~20 tok)
- `templating.py` (~22 tok)
- `testclient.py` (~19 tok)
- `types.py` — Declares import (~110 tok)
- `utils.py` — URL configuration (~2296 tok)
- `websockets.py` (~64 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/fastapi/dependencies/

- `__init__.py` (~0 tok)
- `models.py` — Declares SecurityRequirement (~713 tok)
- `utils.py` — check_file_field, get_param_sub_dependant, get_parameterless_sub_dependant, get_sub_dependant + 8 more (~8641 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/fastapi/middleware/

- `__init__.py` (~17 tok)
- `cors.py` (~23 tok)
- `gzip.py` (~23 tok)
- `httpsredirect.py` (~33 tok)
- `trustedhost.py` (~32 tok)
- `wsgi.py` (~23 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/fastapi/openapi/

- `__init__.py` (~0 tok)
- `constants.py` (~44 tok)
- `docs.py` — get_swagger_ui_html, get_redoc_html, get_swagger_ui_oauth2_redirect_html (~2959 tok)
- `models.py` — Pydantic: BaseModelWithConfig (158 fields) (~4400 tok)
- `utils.py` — URL configuration (~6368 tok)

## services/service-ai/.venv/lib/python3.13/site-packages/fastapi/security/

- `__init__.py` (~252 tok)
