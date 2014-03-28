/*

This file, jv-frontend.js, is based on
opt-frontend.js from the Online Python Tutor.
Changes made by David Pritchard (daveagp@gmail.com);
see README for more details.

Summary of changes made:
- uses Java, not Python
- uses CodeMirror3, not 2
- lazier approach for loading examples

==== Header from opt-frontend.js ====

Online Python Tutor
https://github.com/pgbovine/OnlinePythonTutor/

Copyright (C) 2010-2013 Philip J. Guo (philip@pgbovine.net)

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/


// Pre-reqs: pytutor.js and jquery.ba-bbq.min.js should be imported BEFORE this file


// backend scripts to execute (Python 2 and 3 variants, if available)
//var python2_backend_script = 'web_exec_py2.py';
//var python3_backend_script = 'web_exec_py3.py';

// uncomment below if you're running on Google App Engine using the built-in app.yaml
var python2_backend_script = 'exec';
var python3_backend_script = null;

var java_backend_script = './java_safe_ram_maketrace.php';

var appMode = 'edit'; // 'edit', 'display', or 'display_no_frills'

var preseededCode = null;     // if you passed in a 'code=<code string>' in the URL, then set this var
var preseededCurInstr = null; // if you passed in a 'curInstr=<number>' in the URL, then set this var

var rawInputLst = []; // a list of strings inputted by the user in response to raw_input or mouse_input events

var myVisualizer = null; // singleton ExecutionVisualizer instance

// set keyboard bindings
$(document).keydown(function(k) {
  //if (!keyStuckDown) {
  if (k.keyCode == 37 && myVisualizer != null) { // left arrow
    if (myVisualizer.stepBack()) {
      k.preventDefault(); // don't horizontally scroll the display
      keyStuckDown = true;
    }
  }
  else if (k.keyCode == 39 && myVisualizer != null) { // right arrow
    if (myVisualizer.stepForward()) {
      k.preventDefault(); // don't horizontally scroll the display
      keyStuckDown = true;
    }
  }
  //}
});

$(document).keyup(function(k) {
  keyStuckDown = false;
});


var keyStuckDown = false;

function enterEditMode() {
  $.bbq.pushState({ mode: 'edit' }, 2 /* completely override other hash strings to keep URL clean */);
}

function enterDisplayNoFrillsMode() {
  $.bbq.pushState({ mode: 'display_no_frills' }, 2 /* completely override other hash strings to keep URL clean */);
}

var pyInputCodeMirror; // CodeMirror object that contains the input text

function setCodeMirrorVal(dat) {
  pyInputCodeMirror.setValue(dat.rtrim() /* kill trailing spaces */);
  $('#urlOutput,#embedCodeOutput').val('');

  // also scroll to top to make the UI more usable on smaller monitors
  $(document).scrollTop(0);
}

function getUserArgs() {
  return $.map($('#argslist .arg input'), function(e){return e.value;});
}

function getUserStdin() {
    return window.stdinarea.value;
}

$(document).ready(function() {

  $("#embedLinkDiv").hide();

  pyInputCodeMirror = CodeMirror(document.getElementById('codeInputPane'), {
    mode: 'text/x-java',
    lineNumbers: true,
      matchBrackets: true,
    tabSize: 3,
    indentUnit: 3,
    extraKeys: {
      Tab: function(cm) {
        var lo = cm.getCursor("start").line;
        var hi = cm.getCursor("end").line;
        for (var i = lo; i <= hi; i++)
          cm.indentLine(i, "smart");
        cm.setCursor(cm.getCursor("end"));
        return true;
              },
      F5 : function() {return false;}
    }
  });

//    setCodeMirrorVal(
//        "public class ClassNameHere {\n" +
//            "    public static void main(String[] args) {\n        \n    }\n}");

  pyInputCodeMirror.setSize(null, '420px');



  // be friendly to the browser's forward and back buttons
  // thanks to http://benalman.com/projects/jquery-bbq-plugin/
  $(window).bind("hashchange", function(e) {
    appMode = $.bbq.getState('mode'); // assign this to the GLOBAL appMode

    if (appMode === undefined || appMode == 'edit') {
      $("#pyInputPane").show();
      $("#pyOutputPane").hide();
      $("#embedLinkDiv").hide();

      // destroy all annotation bubbles (NB: kludgy)
      if (myVisualizer) {
        myVisualizer.destroyAllAnnotationBubbles();
      }
    }
    else if (appMode == 'display') {
      $("#pyInputPane").hide();
      $("#pyOutputPane").show();

      $("#embedLinkDiv").show();

      $('#executeBtn').html("Visualize execution");
      $('#executeBtn').attr('disabled', false);


      // do this AFTER making #pyOutputPane visible, or else
      // jsPlumb connectors won't render properly
      myVisualizer.updateOutput();

      // customize edit button click functionality AFTER rendering (NB: awkward!)
      $('#pyOutputPane #editCodeLinkDiv').show();
      $('#pyOutputPane #editBtn').click(function() {
        enterEditMode();
      });
    }
    else if (appMode == 'display_no_frills') {
      $("#pyInputPane").hide();
      $("#pyOutputPane").show();
      $("#embedLinkDiv").show();
    }
    else {
      assert(false);
    }

    $('#urlOutput,#embedCodeOutput').val(''); // clear to avoid stale values
  });


  function executeCode(forceStartingInstr) {
      var backend_script = java_backend_script;
/*      if ($('#pythonVersionSelector').val() == '2') {
          backend_script = python2_backend_script;
      }
      else if ($('#pythonVersionSelector').val() == '3') {
          backend_script = python3_backend_script;
      }

      if (!backend_script) {
        alert('Error: This server is not configured to run Python ' + $('#pythonVersionSelector').val());
        return;
      }*/

      $('#executeBtn').html("Please wait ... processing your code");
      $('#executeBtn').attr('disabled', true);
      $("#pyOutputPane").hide();
      $("#embedLinkDiv").hide();


      // set up all options in a JS object
      var options = {cumulative_mode: ($('#cumulativeModeSelector').val() == 'true'),
                     heap_primitives: ($('#heapPrimitivesSelector').val() == 'true'),
                     show_only_outputs: ($('#showOnlyOutputsSelector').val() == 'true')};

    var java_options = {};
    java_options.showStringsAsValues = !$('#showStringsAsObjects').is(':checked');
    java_options.showAllFields = $('#showAllFields').is(':checked');
    $.ajax({url: backend_script,
            data: {data : JSON.stringify({
              user_script : pyInputCodeMirror.getValue(),
              options: java_options,
              args: getUserArgs(),
              stdin: getUserStdin()})},
           /*,
             raw_input_json: rawInputLst.length > 0 ? JSON.stringify(rawInputLst) : '',
             options_json: JSON.stringify(options)*/
            dataType: "json",
            timeout: 10000, //ms
		error: ajaxErrorHandler,
            success: function(dataFromBackend) {
              console.log(["Data from backend:", dataFromBackend]);

              var trace = dataFromBackend.trace;

              // don't enter visualize mode if there are killer errors:
              if (!trace ||
                  (trace.length == 0) ||
                  (trace[trace.length - 1].event == 'uncaught_exception')) {

                if (trace.length == 1) {
                  var errorLineNo = trace[0].line - 1; /* CodeMirror lines are zero-indexed */
                  if (errorLineNo !== undefined) {
                    // highlight the faulting line in pyInputCodeMirror
                    pyInputCodeMirror.focus();
                    pyInputCodeMirror.setCursor(errorLineNo, 0);
                    var marked = pyInputCodeMirror.addLineClass(errorLineNo, null, 'errorLine');
                      console.log(marked);
                      var hook = function(marked) { return function() {
                          pyInputCodeMirror.removeLineClass(marked, null, 'errorLine'); // reset line back to normal
                          pyInputCodeMirror.off('change', hook); // cancel
                      }} (marked);
                      pyInputCodeMirror.on('change', hook); 
                  }

                  alert(trace[0].exception_msg);
                }
                else if (trace[trace.length - 1].exception_msg) {
                  alert(trace[trace.length - 1].exception_msg);
                }
                else {
                  alert("Whoa, unknown error! Reload to try again, or report a bug to daveagp@gmail.com\n\n(Click the 'Generate URL' button to include a unique URL in your email bug report.)");
                }

                $('#executeBtn').html("Visualize execution");
                $('#executeBtn').attr('disabled', false);
              }
              else {
                var startingInstruction = 0;

                // only do this at most ONCE, and then clear out preseededCurInstr
                if (preseededCurInstr && preseededCurInstr < trace.length) { // NOP anyways if preseededCurInstr is 0
                  startingInstruction = preseededCurInstr;
                  preseededCurInstr = null;
                }

                // forceStartingInstr overrides everything else
                if (forceStartingInstr !== undefined) {
                  startingInstruction = forceStartingInstr;
                }

                myVisualizer = new ExecutionVisualizer('pyOutputPane',
                                                       dataFromBackend,
                                                       {startingInstruction:  startingInstruction,
                                                        updateOutputCallback: function() {$('#urlOutput,#embedCodeOutput').val('');},
                                                        // tricky: selector 'true' and 'false' values are strings!
                                                        disableHeapNesting: ($('#heapPrimitivesSelector').val() == 'true'),
                                                        drawParentPointers: ($('#drawParentPointerSelector').val() == 'true'),
                                                        textualMemoryLabels: ($('#textualMemoryLabelsSelector').val() == 'true'),
                                                        showOnlyOutputs: ($('#showOnlyOutputsSelector').val() == 'true'),
                                                        executeCodeWithRawInputFunc: executeCodeWithRawInput,
                                                        //allowEditAnnotations: true,
                                                        resizeLeftRight: true,
                                                        highlightLines: true,
                                                        lang: "java",
                                                        stdin: getUserStdin()
                                                       });
                  

                // also scroll to top to make the UI more usable on smaller monitors
                $(document).scrollTop(0);

                $.bbq.pushState({ mode: 'display' }, 2 /* completely override other hash strings to keep URL clean */);
              }
            }});
  }

  function executeCodeFromScratch() {
    // reset these globals
    rawInputLst = [];

    executeCode();
  }

  function executeCodeWithRawInput(rawInputStr, curInstr) {
    enterDisplayNoFrillsMode();

    // set some globals
    rawInputLst.push(rawInputStr);

    executeCode(curInstr);
  }

  $("#executeBtn").attr('disabled', false);
  $("#executeBtn").click(executeCodeFromScratch);


  // canned examples

    var examplesDir = "./example-code/";

    var exampleCount = 0;
    
    var exampleCallback = function(url) {
	return function() {$.get(url, setCodeMirrorVal); return false;};
    }

    String.prototype.endsWith = function(suffix) {
	return this.indexOf(suffix, this.length - suffix.length) !== -1;
    };

    var populateExamples = function(index_page) { 
	$(index_page).find("td > a").each(function() {
		var filename = $(this).attr("href");
		if (filename.endsWith(".java")) { // skip link to ..
		    if (exampleCount != 0) 
			$("#examplesHolder").append(" | ");
		    exampleCount++;
		    var newItem = $("<a href='#'>" + filename.substring(0, filename.length-5) + "</a>");
		    newItem.click(exampleCallback(examplesDir + filename));
		    $("#examplesHolder").append(newItem);
		}
	    });
    };

    $.ajax({
	    url: "./example-code/",
	    success: populateExamples,
	    error: function() { $.ajax({
			url: "./example-code/backup-listing.html", 
			    success: populateExamples,
			    error: ajaxErrorHandler}); }
	});

/*
  $("#tutorialExampleLink").click(function() {
    $.get(examplesDir + "py_tutorial.txt", setCodeMirrorVal);
    return false;
  });

  $("#strtokExampleLink").click(function() {
    $.get(examplesDir + "strtok.txt", setCodeMirrorVal);
    return false;
  });

  $("#listCompLink").click(function() {
    $.get(examplesDir + "list-comp.txt", setCodeMirrorVal);
    return false;
  });

  $("#fibonacciExampleLink").click(function() {
    $.get(examplesDir + "fib.txt", setCodeMirrorVal);
    return false;
  });

  $("#memoFibExampleLink").click(function() {
    $.get(examplesDir + "memo_fib.txt", setCodeMirrorVal);
    return false;
  });

  $("#factExampleLink").click(function() {
    $.get(examplesDir + "fact.txt", setCodeMirrorVal);
    return false;
  });

  $("#filterExampleLink").click(function() {
    $.get(examplesDir + "filter.txt", setCodeMirrorVal);
    return false;
  });

  $("#insSortExampleLink").click(function() {
    $.get(examplesDir + "ins_sort.txt", setCodeMirrorVal);
    return false;
  });

  $("#aliasExampleLink").click(function() {
    $.get(examplesDir + "aliasing.txt", setCodeMirrorVal);
    return false;
  });

  $("#happyExampleLink").click(function() {
    $.get(examplesDir + "happy.txt", setCodeMirrorVal);
    return false;
  });

  $("#newtonExampleLink").click(function() {
    $.get(examplesDir + "sqrt.txt", setCodeMirrorVal);
    return false;
  });

  $("#oopSmallExampleLink").click(function() {
    $.get(examplesDir + "oop_small.txt", setCodeMirrorVal);
    return false;
  });

  $("#mapExampleLink").click(function() {
    $.get(examplesDir + "map.txt", setCodeMirrorVal);
    return false;
  });

  $("#rawInputExampleLink").click(function() {
    $.get(examplesDir + "raw_input.txt", setCodeMirrorVal);
    return false;
  });

  $("#oop1ExampleLink").click(function() {
    $.get(examplesDir + "oop_1.txt", setCodeMirrorVal);
    return false;
  });

  $("#oop2ExampleLink").click(function() {
    $.get(examplesDir + "oop_2.txt", setCodeMirrorVal);
    return false;
  });

  $("#inheritanceExampleLink").click(function() {
    $.get(examplesDir + "oop_inherit.txt", setCodeMirrorVal);
    return false;
  });

  $("#sumExampleLink").click(function() {
    $.get(examplesDir + "sum.txt", setCodeMirrorVal);
    return false;
  });

  $("#pwGcdLink").click(function() {
    $.get(examplesDir + "wentworth_gcd.txt", setCodeMirrorVal);
    return false;
  });

  $("#pwSumListLink").click(function() {
    $.get(examplesDir + "wentworth_sumList.txt", setCodeMirrorVal);
    return false;
  });

  $("#towersOfHanoiLink").click(function() {
    $.get(examplesDir + "towers_of_hanoi.txt", setCodeMirrorVal);
    return false;
  });

  $("#pwTryFinallyLink").click(function() {
    $.get(examplesDir + "wentworth_try_finally.txt", setCodeMirrorVal);
    return false;
  });

  $("#sumCubesLink").click(function() {
    $.get(examplesDir + "sum-cubes.txt", setCodeMirrorVal);
    return false;
  });

  $("#decoratorsLink").click(function() {
    $.get(examplesDir + "decorators.txt", setCodeMirrorVal);
    return false;
  });

  $("#genPrimesLink").click(function() {
    $.get(examplesDir + "gen_primes.txt", setCodeMirrorVal);
    return false;
  });

  $("#genExprLink").click(function() {
    $.get(examplesDir + "genexpr.txt", setCodeMirrorVal);
    return false;
  });


  $('#closure1Link').click(function() {
    $.get(examplesDir + "closures/closure1.txt", setCodeMirrorVal);
    return false;
  });
  $('#closure2Link').click(function() {
    $.get(examplesDir + "closures/closure2.txt", setCodeMirrorVal);
    return false;
  });
  $('#closure3Link').click(function() {
    $.get(examplesDir + "closures/closure3.txt", setCodeMirrorVal);
    return false;
  });
  $('#closure4Link').click(function() {
    $.get(examplesDir + "closures/closure4.txt", setCodeMirrorVal);
    return false;
  });
  $('#closure5Link').click(function() {
    $.get(examplesDir + "closures/closure5.txt", setCodeMirrorVal);
    return false;
  });
  $('#lambdaParamLink').click(function() {
    $.get(examplesDir + "closures/lambda-param.txt", setCodeMirrorVal);
    return false;
  });
  $('#tortureLink').click(function() {
    $.get(examplesDir + "closures/student-torture.txt", setCodeMirrorVal);
    return false;
  });



  $('#aliasing1Link').click(function() {
    $.get(examplesDir + "aliasing/aliasing1.txt", setCodeMirrorVal);
    return false;
  });
  $('#aliasing2Link').click(function() {
    $.get(examplesDir + "aliasing/aliasing2.txt", setCodeMirrorVal);
    return false;
  });
  $('#aliasing3Link').click(function() {
    $.get(examplesDir + "aliasing/aliasing3.txt", setCodeMirrorVal);
    return false;
  });
  $('#aliasing4Link').click(function() {
    $.get(examplesDir + "aliasing/aliasing4.txt", setCodeMirrorVal);
    return false;
  });
  $('#aliasing5Link').click(function() {
    $.get(examplesDir + "aliasing/aliasing5.txt", setCodeMirrorVal);
    return false;
  });
  $('#aliasing6Link').click(function() {
    $.get(examplesDir + "aliasing/aliasing6.txt", setCodeMirrorVal);
    return false;
  });
  $('#aliasing7Link').click(function() {
    $.get(examplesDir + "aliasing/aliasing7.txt", setCodeMirrorVal);
    return false;
  });
  $('#aliasing8Link').click(function() {
    $.get(examplesDir + "aliasing/aliasing8.txt", setCodeMirrorVal);
    return false;
  });


  $('#ll1Link').click(function() {
    $.get(examplesDir + "linked-lists/ll1.txt", setCodeMirrorVal);
    return false;
  });
  $('#ll2Link').click(function() {
    $.get(examplesDir + "linked-lists/ll2.txt", setCodeMirrorVal);
    return false;
  });
  $('#sumListLink').click(function() {
    $.get(examplesDir + "sum-list.txt", setCodeMirrorVal);
    return false;
  });

  $('#varargsLink').click(function() {
    $.get(examplesDir + "varargs.txt", setCodeMirrorVal);
    return false;
  });

  $('#forElseLink').click(function() {
    $.get(examplesDir + "for-else.txt", setCodeMirrorVal);
    return false;
  });

  $('#nonlocalLink').click(function() {
    $.get(examplesDir + "nonlocal.txt", setCodeMirrorVal);
    return false;
  });
*/

  // handle hash parameters passed in when loading the page
  preseededCode = $.bbq.getState('code');
  if (preseededCode) {
    setCodeMirrorVal(preseededCode);
  }
  else {
    // select a canned example on start-up:
    exampleCallback(examplesDir+"(Default).java")();

      //    $("#aliasExampleLink").trigger('click');
  }

  var loadExample = $.bbq.getState('sampleFile');
  if (loadExample) {
      console.log(loadExample);
      if (loadExample.match(/[a-zA-Z]+/))
    exampleCallback(examplesDir+loadExample+".java")();
  }

  var userArgs = $.bbq.getState('args'); 
  if (userArgs) {
    var args_a = JSON.parse(userArgs);
    for (var i=0; i<args_a.length; i++)
      addArg(args_a[i]);
  }

  var userStdin = $.bbq.getState('stdin'); 
  if (userStdin) {
    $('#stdin-xdiv').show();
    $('#stdinarea').val(userStdin);
  }

  // parse query string options ...
  // ugh, ugly tristate due to the possibility of them being undefined

  if (typeof $.bbq.getState('showStringsAsObjects') !== "undefined") {
    $('#showStringsAsObjects').prop('checked', true);
    $('#options').show();
  }
  if (typeof $.bbq.getState('showAllFields') !== "undefined") {
    $('#showAllFields').prop('checked', true);
    $('#options').show();
  }

  appMode = $.bbq.getState('mode'); // assign this to the GLOBAL appMode
  if ((appMode == "display") && preseededCode /* jump to display only with pre-seeded code */) {
    preseededCurInstr = Number($.bbq.getState('curInstr'));
    $("#executeBtn").trigger('click');
  }
  else {
    if (appMode === undefined) {
      // default mode is 'edit', don't trigger a "hashchange" event
      appMode = 'edit';
    }
    else {
      // fail-soft by killing all passed-in hashes and triggering a "hashchange"
      // event, which will then go to 'edit' mode
      $.bbq.removeState();
    }
  }


  // log a generic AJAX error handler
  var ajaxErrorHandler = function(jqXHR, textStatus, errorThrown) {
      var errinfo = "textStatus: " + textStatus + "\nerrorThrown: " + errorThrown + "\nServer reply: " + jqXHR.responseText;

      alert("Server error. Report a bug to daveagp@gmail.com (click 'Generate URL' and include it). Debug info (also copied to console):\n" + errinfo);
      
      console.log(errinfo);

      $('#executeBtn').html("Visualize execution");
      $('#executeBtn').attr('disabled', false);
  };

  //  $(document).ajaxError(ajaxErrorHandler);


  // redraw connector arrows on window resize
  $(window).resize(function() {
    if (appMode == 'display') {
      myVisualizer.redrawConnectors();
    }
  });

  $('#genUrlBtn').bind('click', function() {
    var myArgs = {code: pyInputCodeMirror.getValue(),
                  mode: appMode                  
                  /*
                  , cumulative: $('#cumulativeModeSelector').val(),
                  heapPrimitives: $('#heapPrimitivesSelector').val(),
                  drawParentPointers: $('#drawParentPointerSelector').val(),
                  textReferences: $('#textualMemoryLabelsSelector').val(),
                  showOnlyOutputs: $('#showOnlyOutputsSelector').val(),
                  py: $('#pythonVersionSelector').val()
                  */};

    // the presence of the key is used, the value is not used
    if ($('#showStringsAsObjects').is(':checked'))
      myArgs.showStringsAsObjects='';
    if ($('#showAllFields').is(':checked'))
      myArgs.showAllFields='';

    if (getUserArgs().length > 0)
      myArgs.args = JSON.stringify(getUserArgs());

    if (getUserStdin().length > 0)
      myArgs.stdin = getUserStdin();

    if (appMode == 'display') {
      myArgs.curInstr = myVisualizer.curInstr;
    }

    var urlStr = $.param.fragment(window.location.href, myArgs, 2 /* clobber all */);
    $('#urlOutput').val(urlStr);
  });


  $('#genEmbedBtn').bind('click', function() {
    assert(appMode == 'display');
    var myArgs = {code: pyInputCodeMirror.getValue(),
                  cumulative: $('#cumulativeModeSelector').val(),
                  heapPrimitives: $('#heapPrimitivesSelector').val(),
                  drawParentPointers: $('#drawParentPointerSelector').val(),
                  textReferences: $('#textualMemoryLabelsSelector').val(),
                  showOnlyOutputs: $('#showOnlyOutputsSelector').val(),
                  py: $('#pythonVersionSelector').val(),
                  curInstr: myVisualizer.curInstr,
                 };

    var embedUrlStr = $.param.fragment('http://pythontutor.com/iframe-embed.html', myArgs, 2 /* clobber all */);
    var iframeStr = '<iframe width="800" height="500" frameborder="0" src="' + embedUrlStr + '"> </iframe>';
    $('#embedCodeOutput').val(iframeStr);
  });
});

