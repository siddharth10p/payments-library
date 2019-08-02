<!DOCTYPE html>
<!-- Paypal Help: https://developer.paypal.com/docs/checkout/reference/customize-sdk-->
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
</head>

<body>
  <script
    src="https://www.paypal.com/sdk/js?client-id=sb&merchant-id=PUBTL88TYUYXA">
  </script>
  <script src="https://code.jquery.com/jquery-2.2.4.min.js"></script>

  <div id="paypal-button-container"></div>

  <!-- script>
    paypal.Buttons().render('body');;
  </script -->
  <script>
  paypal.Buttons({
    createOrder: function(data, actions) {
      return actions.order.create({
        purchase_units: [{
          amount: {
            "currency_code": "USD",
            "value": "1.25"
            }
        }]
      });
    },

    onApprove: function(data, actions) {
      console.log ("data ===> ", data);
      // Capture the funds from the transaction
      return actions.order.capture().then(function(details) {
        // Show a success message to your buyer
        console.log ("details ===> ", details);
        //alert('Transaction completed by ' + details.payer.name.given_name);
        callServerApi (details);
      });
    }
  }).render('#paypal-button-container');

  var endPoint = 'https://test-abc-developer-edition.na91.force.com/services/apexrest/v1';

  function callServerApi (paypalResponse) {
    console.log ("paypalResponse", paypalResponse);
    var resdata = {
      payload : JSON.stringify (paypalResponse),
      action : "paypalCheckout"
    }
    console.log ("Json Response ==> ", JSON.stringify (resdata));

    $.ajax ({
        type : 'POST',
        url: endPoint,
        headers : {
          "content-type" : "text/plain"
        },
        data : JSON.stringify (resdata),
        success : sfCallback
    });
  };

  function sfCallback (res) {
      console.log ("res", res);
  }

</script>

</body>
