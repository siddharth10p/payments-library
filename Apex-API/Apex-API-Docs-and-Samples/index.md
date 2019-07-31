# Payment360 Apex API v1

## Introduction

The purpose of the Apex API is to provide Salesforce developers classes and methods to manipulate Payment Methods, Transactions and Stripe Customers. The API is created in the form of a global Apex class, so it is available in your org when the payments package is installed.

## Structure
All of the classes are part of the `bt_stripe.P360_API_v1` class.

The following wrapper classes are available:

* `bt_stripe.Customer` represents a Customer in Stripe's database. Corresponds to the **bt_stripe__Stripe_Customer__c** object
* `bt_stripe.PM` represents Payment Method in Stripe's database. Corresponds to the **bt_stripe__Payment_Method__c** object
* `bt_stripe.Tra` represents Transaction in Stripe's database. Corresponds to the **bt_stripe__Transaction__c** object

Create these objects using factory methods below because the API class should register them in the background:

* `bt_stripe.P360_API_v1.customerFactory()`
* `bt_stripe.P360_API_v1.paymentMethodFactory()`
* `bt_stripe.P360_API_v1.transactionFactory()`

After you create your entity objects and do some actions, you need to commit your work using the following method:

`bt_stripe.P360_API_v1.commitWork()`

This call saves your work in existing or new SOQL recods. This is a DML operation, so make sure you don't make any HTTP callouts after making the commit call. Also, after the commit don't do any payment360 API actions -- this should be the last action in your executing context.

## Basic example

This code snippet creates a new Customer and adds a new Payment Method. Once the Payment Method is registered to Stripe, a new Transaction is created and captured. If you copy this code and execute it in the Salesforce Developer Console, it will create 3 records in Salesforce: Stripe Customer, Payment Method and Transaction.

Note that all the entities are created using the factory methods. You need to set all the required properties. After they are set, you can call action methods on them. For example `c.registerCustomer()` or `t.capture()`.

Also note that `bt_stripe.P360_API_v1.commitWork()` is happening as the very last action.

It is very important to catch any errors. If an error happens (for example, a Payment Method can't be registered for some reason), the API is throwing a `bt_stripe.P360_API_v1.P360_Exception`. Catching the error can let you decide about the further flow of your business logic. 


```
// You need to select a Payment Gateway - it's important to set the paymentGatewayId property on all object instances
bt_stripe__Payment_Gateway__c[] pgList = [SELECT Id FROM bt_stripe__Payment_Gateway__c
	WHERE bt_stripe__Default__c = true];

// pass in a bt_stripe__Stripe_Customer__c Id - if set, we'll use that bt_stripe__Stripe_Customer__c, if null we'll create a new record
Id stripeCustomerId = null;

// create these outside the try block so we can reference them outsize the try/catch block if necessary
bt_stripe.P360_API_v1.Customer customer;
bt_stripe.P360_API_v1.PM pm;
bt_stripe.P360_API_v1.Tra tran;

// It is good practice to put your p360 action in a try block. If something goes wrong,
// the API throws a bt_stripe.P360_API_v1.P360_Exception exception
try {
	/* initialize a new Stripe Customer object using factory methods - if a customerId (bt_stripe__Stripe_Contact__c.Id)
	is passed in, that Stripe Customer record is used. if the customerId is null, a new bt_stripe__Stripe_Contact__c
	record will be created */
	customer = bt_stripe.P360_API_v1.customerFactory(stripeCustomerId);

	if (customer.record == null || customer.record.Id == null) {
		// did not find a Stripe Customer record for the stripeCustomerId - was probably null)
		// need to set these required fields since the Stripe Customer was not found and call registerCustomer()
		customer.paymentGatewayId = pgList[0].Id;
		customer.name = 'New Customer';
		customer.email = 'someone@blackthorn.io';
		// this method creates a Customer record in Stripe but does not yet create a Stripe Customer record in SF
		customer.registerCustomer();
	}

	// initialize a new Payment Method object using factory methods
	pm = bt_stripe.P360_API_v1.paymentMethodFactory();

	pm.paymentGatewayId = pgList[0].Id;
	// Some properties are object instances. For example a bt_stripe.P360_API_v1.Customer object instance
	pm.customer = customer;
	pm.cardHolderName = 'New Customer';
	/* some Stripe decline test cards
	4000000000009995 - Charge is declined with decline_code attribute = insufficient_funds
	4000000000009987 - Charge is declined with decline_code attribute = lost_card
	4000000000009979 - Charge is declined with decline_code attribute = stolen_card
	*/
	pm.cardNumber = '4242424242424242'; // valid test card - will result in a successful PM and Transaction
	pm.cardExpYear = '2023';
	pm.cardExpMonth = '12';
	pm.cvv = '555';

	pm.email = 'hello@blackthorn.io';
	pm.street = '1060 W Addison Ave';
	pm.city = 'Chicago';
	pm.state = 'IL';
	pm.postalCode = '62808';
	pm.country = 'US';
	pm.defaultpm = true;

	// this method creates a Payment Method in Stripe but does not yet create a Payment Method in SF
	pm.registerPM();

	/* look for error messages on the Payment Method - this field is set if Stripe returns a decline code or if the card fails the 		fraud/cvv/zip check */
	if (String.isNotBlank(pm.record.bt_stripe__Error_Message__c)) {
		// commit work here will create a Stripe Customer and Payment Method (w Status = Invalid) record
		bt_stripe.P360_API_v1.commitWork();
		System.debug('pm.record.bt_stripe__Payment_Method_Status__c = ' + pm.record.bt_stripe__Payment_Method_Status__c);
		System.debug('pm.record.bt_stripe__Error_Message__c = ' + pm.record.bt_stripe__Error_Message__c);
		/* return the Stripe Customer Id to the Component/Page and store it as an attribute. then pass it in if the customer 			enters a new */
		// credit card and the new Payment Method will be associated to the existing Stripe Customer
		System.debug('customer.record.Id = ' + customer.record.Id);
		return; // return the Stripe Customer Id and error message to the Component/Page
	}

	// create a Transaction, set the amount and Payment Method - then capture it
	tran = bt_stripe.P360_API_v1.transactionFactory();
	tran.pm = pm;
	tran.amount = 1.50;
	tran.capture();
} catch (bt_stripe.P360_API_v1.P360_Exception e) {
	System.debug(LoggingLevel.ERROR, 'Error: ' + e.getMessage());
}
bt_stripe.P360_API_v1.commitWork(); // commit work so SF records are created

// get the Stripe Customer record so the Id can be used if you want to ask for another Payment Method from the customer
bt_stripe__Stripe_Customer__c stripeCustomer = customer.record;
System.debug('stripeCustomer = ' + stripeCustomer);
System.debug('stripeCustomer.Id = ' + stripeCustomer.Id);

// this Payment Method will have Payment Method Status = Invalid and a Error Message = Your card has insufficient funds.
bt_stripe__Payment_Method__c paymentMethod = pm.record;
System.debug('paymentMethod = ' + paymentMethod);
System.debug('paymentMethod.Id = ' + paymentMethod.Id);

// this Transaction will have Transaction Status = Needs Review - you could also reuse this Transaction - just change the Payment Method
bt_stripe__Transaction__c transactionRecord = tran.record;
System.debug('transactionRecord = ' + transactionRecord);
System.debug('transactionRecord.Id = ' + transactionRecord.Id);
```

## Classes

### bt_stripe.P360_API_v1.Customer

Represents a Stripe Customer

#### Initializing

Use the `customerFactory()` method.

* `bt_stripe.P360_API_v1.Customer c = bt_stripe.P360_API_v1.customerFactory();`

Creates an empty Customer class.

* `bt_stripe.P360_API_v1.Customer c = bt_stripe.P360_API_v1.customerFactory(stripeCustomerId);`

Creates a Customer class from an existing SOQL **bt_stripe__Stripe_Customer__c** object.

#### Properties

* __name__ Name of the Customer. Required.
* __email__ Email of the Customer.
* __paymentGatewayId__ Id of the Payment Gateway associated with the Stripe Customer. Required.
* __accountId__ Id of the Account associated with the Customer.
* __contactId__ Id of the Contact associated with the Customer.
* __record__ **bt_stripe__Stripe_Customer__c** record of the Customer. Available after calling the `registerCustomer()` method.

#### Actions

* `registerCustomer()` Registers the Customer in Stripe. After calling the method, __record__ property is available.

* `updateCustomer()` Need to implement.




### bt_stripe.P360_API_v1.PM

Represents a Stripe Payment Method (Works with credit cards only for now)

#### Initializing

Use the `paymentMethodFactory()` method.

* `bt_stripe.P360_API_v1.PM p = bt_stripe.P360_API_v1.paymentMethodFactory();`

Creates an empty PM class.

* `bt_stripe.P360_API_v1.PM p = bt_stripe.P360_API_v1.paymentMethodFactory(paymentMethodId);`

Creates a PM class from an existing SOQL **bt_stripe__Payment_Method__c** object.

#### Properties
* __paymentGatewayId__ Id of the Payment Gateway associated with the Stripe Payment Method. Required.
* __customer__ reference to bt_stripe.P360_API_v1.Customer object for associating Payment Method to Customer. Required.
* __cardHolderName__ Name on the card. Required.
* __stripeToken__ Tokenized card or ACH. string represantation (tok_XXXXXXXXX); see Token object on Stripe REST API docs. USE THIS instead of raw card data if possible.

OR

* __cardNumber__ The card number, as a string without any separators. Required.
* __cardExpYear__ Two or four digit number representing the card's expiration year. Required. 
* __cardExpMonth__ Two digit number representing the card's expiration month. Required.
* __cvv__ Card security code. Not required, but it is good practice to always pass this property.
* __record__ **bt_stripe__Payment_Method__c** record of the Payment Method. Available after calling the `registerPM()` method.

AND

* __street__ Credit card holder's street
* __city__ Credit card holder's city
* __country__ Credit card holder's country
* __postalCode__ Credit card holder's postalcode
* __state__ Credit card holder's state
* __email__ Credit card holder's email
* __defaultpm__ If set to `true`, the new Payment Method is set as the Customer's default
#### Actions

* `registerPM()` Registers the Payment Method in Stripe. After calling the method, __record__ property is available.

* `updatePM()` Need to implement.


### bt_stripe.P360_API_v1.Tra

Represents a Stripe Transaction

#### Initializing

Use the `transactionFactory()` method.

* `bt_stripe.P360_API_v1.Tra t = bt_stripe.P360_API_v1.transactionFactory();`

Creates an empty Tra class.

* `bt_stripe.P360_API_v1.Tra t = bt_stripe.P360_API_v1.transactionFactory(transId);`

Creates a Tra class from an existing SOQL **bt_stripe__Transaction__c** object.

#### Properties

* __pm__ reference to bt_stripe.P360_API_v1.PM object for associating Transaction to Payment Method. Required.
* __amount__ Decimal number representing how much to charge (in dollars). The smallest accepted amount is 0.05. Required.
* __dueDate__ Used by Payment360 app for auto-processing transactions on scheduled dates. Optional.
* __authOnly__ Boolean flag for creating authorize-only transactions. Default value is false.
* __paymentGatewayId__ Id of the Payment Gateway associated with the Stripe Transaction. Required.
* __record__ **bt_stripe__Transaction__c** record of the Payment Method. Available after calling the `register()` method.
* __currencyCode__ 3-letter ISO code of the used currency. If not set, default Payment Gateway currency is used.
* __description__ Description of the Transaction. Will be displayed on the record and in the Stripe Dashboard.

#### Actions

* `register()` Registers an open transaction in Salesforce.com database without sending it to Stripe server. After calling the method, __record__ property is available.

* `authorize()` Authorizes a new or existing open transaction. Throws exception if transaction is already authorized or captured.

* `capture()` Captures a new or existing open/authorized transaction. Throws exception if the transaction is already captured.

* `refund()` For making full refund on captured transactions. Create a tra class instance using SOQL `bt_stripe.P360_API_v1.Tra t = bt_stripe.P360_API_v1.transactionFactory(transId);`. The transId is a captured transaction Id. Then, call `t.refund()` method and lastly use `P360_API_v1.commitWork()` to commit the changes in Salesforce. See the example #7 below to view the code sample.

* `refundAmount(Decimal refundAmount)` For making partial refund on captured transactions. Create a tra class instance using SOQL `bt_stripe.P360_API_v1.Tra t = bt_stripe.P360_API_v1.transactionFactory(transId);`. The transId is a captured transaction Id. Then, call `t.refund(Decimal refundAmount)` method  and lastly use `P360_API_v1.commitWork()` to commit the changes in Salesforce. See the example #8 below to view the code sample.

* `setParent(Schema.SObjectField field, Object value)` For associating a transaction record to a parent SObject record. Need to implement.

### Examples

Example 1: Creating a Stripe Customer

	try {
		bt_stripe.P360_API_v1.Customer c = bt_stripe.P360_API_v1.customerFactory();
		
		c.paymentGatewayId = pgList[0].Id;
		c.name = name;
		c.email = email;
		
		//optionally set AccountId and/or ContactId for associating new customer with
		c.accountId = accountId;
		c.contactId = contactId;
		
		//bt_stripe.P360_API_v1.P360_Exception if something goes wrong with creating customer in Stripe
		c.registerCustomer();
		
		//bt_stripe.P360_API_v1.P360_Exception if something goes wrong with committing records in database
		bt_stripe.P360_API_v1.commitWork();
	} catch (Exception ex) {
		//do error handling here
	}

Example 2: Creating a Stripe Customer and Stripe Payment Method

	try {
		bt_stripe.P360_API_v1.Customer c = bt_stripe.P360_API_v1.customerFactory();
		
		c.paymentGatewayId = pgList[0].Id;
		c.name = name;
		c.email = email;
		//optionally set AccountId and/or ContactId for associating new customer with
		c.accountId = accountId;
		c.contactId = contactId;
		//bt_stripe.P360_API_v1.P360_Exception if something goes wrong with creating customer in Stripe
		c.registerCustomer();
		
		bt_stripe.P360_API_v1.PM pm = bt_stripe.P360_API_v1.paymentMethodFactory();
		pm.paymentGatewayId = pgList[0].Id;
		pm.customer = c;
		pm.cardHolderName = 'test customer';
		pm.cardNumber = '4242424242424242';
		pm.cardExpYear = '19';
		pm.cardExpMonth = '09';
		pm.cvv = '000';
		//bt_stripe.P360_API_v1.P360_Exception if something goes wrong with creating Payment Method in Stripe
		pm.registerPM();

		/* look for error messages on the Payment Method - this field is set if Stripe returns a decline code or if
		the card fails the fraud/cvv/zip check */
		if (String.isNotBlank(pm.record.bt_stripe__Error_Message__c)) {
			// if you're in this if statement, the Payment Method was declined
			System.debug('bt_stripe__Payment_Method_Status__c = ' + pm.record.bt_stripe__Payment_Method_Status__c);
			System.debug('bt_stripe__Error_Message__c = ' + pm.record.bt_stripe__Error_Message__c);
		}

		//bt_stripe.P360_API_v1.P360_Exception if something goes wrong with committing records in database
		bt_stripe.P360_API_v1.commitWork();
	} catch (Exception ex) {
		//do error handling here
	}

Example 3: Creating a Stripe Customer, Stripe Payment Method and capture Stripe Transaction

	try {
		bt_stripe.P360_API_v1.Customer c = bt_stripe.P360_API_v1.customerFactory();
		
		c.paymentGatewayId = pgList[0].Id;
		c.name = name;
		c.email = email;
		//optionally set AccountId and/or ContactId for associating the new customer with
		c.accountId = accountId;
		c.contactId = contactId;
		//bt_stripe.P360_API_v1.P360_Exception if something goes wrong with creating the customer in Stripe
		c.registerCustomer();
		
		bt_stripe.P360_API_v1.PM pm = bt_stripe.P360_API_v1.paymentMethodFactory();
		pm.paymentGatewayId = pgList[0].Id;
		pm.customer = c;
		pm.cardHolderName = 'test customer';
		pm.cardNumber = '4242424242424242';
		pm.cardExpYear = '19';
		pm.cardExpMonth = '09';
		pm.cvv = '000';
		//bt_stripe.P360_API_v1.P360_Exception if something goes wrong with creating the Payment Method in Stripe
		pm.registerPM();

		/* look for error messages on the Payment Method - this field is set if Stripe returns a decline code or if
		the card fails the fraud/cvv/zip check */
		if (String.isNotBlank(pm.record.bt_stripe__Error_Message__c)) {
			// if you're in this if statement, the Payment Method was declined
			System.debug('bt_stripe__Payment_Method_Status__c = ' + pm.record.bt_stripe__Payment_Method_Status__c);
			System.debug('bt_stripe__Error_Message__c = ' + pm.record.bt_stripe__Error_Message__c);
		}

		bt_stripe.P360_API_v1.Tra t = bt_stripe.P360_API_v1.transactionFactory();
		t.paymentGatewayId = pgList[0].Id;
		t.pm = pm;
		t.amount = 110.5;
		//bt_stripe.P360_API_v1.P360_Exception if something goes wrong with processing the Transaction
		t.capture();
		
		//bt_stripe.P360_API_v1.P360_Exception if something goes wrong with committing records in database
		bt_stripe.P360_API_v1.commitWork();
	} catch (Exception ex) {
		//do error handling here
	}
	
Example 4: Creating Payment Method for an existing Customer

	try {
		bt_stripe.P360_API_v1.Customer c = bt_stripe.P360_API_v1.customerFactory('0Xxxx0123afg');
		
		bt_stripe.P360_API_v1.PM pm = bt_stripe.P360_API_v1.paymentMethodFactory();
		pm.paymentGatewayId = pgList[0].Id;
		pm.customer = c;
		pm.cardHolderName = 'test customer';
		pm.cardNumber = '4242424242424242';
		pm.cardExpYear = '19';
		pm.cardExpMonth = '09';
		pm.cvv = '000';
		//bt_stripe.P360_API_v1.P360_Exception if something goes wrong with creating a Payment Method in Stripe
		pm.registerPM();

		//bt_stripe.P360_API_v1.P360_Exception if something goes wrong with committing records in database
		bt_stripe.P360_API_v1.commitWork();
	} catch (Exception ex) {
		//do error handling here
	}
	
Example 5: Creating an Open transaction with existing Payment Method (and customer, as its associated with PM)

	try {
		bt_stripe.P360_API_v1.PM pm = bt_stripe.P360_API_v1.paymentMethodFactory('0Xxxx0123afg');
		
		bt_stripe.P360_API_v1.Tra t = bt_stripe.P360_API_v1.transactionFactory();
		t.paymentGatewayId = pgList[0].Id;
		t.pm = pm;
		t.amount = 110.5;
		t.register();
		
		//bt_stripe.P360_API_v1.P360_Exception if something goes wrong with committing records in database
		bt_stripe.P360_API_v1.commitWork();
	} catch (Exception ex) {
		//do error handling here
	}
	
Example 5: Authorizing an existing Open transaction

	try {
		bt_stripe.P360_API_v1.Tra t = bt_stripe.P360_API_v1.transactionFactory('0Xxxx0123afg');
		t.authorize();
		
		//bt_stripe.P360_API_v1.P360_Exception if something goes wrong with committing records in database
		bt_stripe.P360_API_v1.commitWork();
	} catch (Exception ex) {
		//do error handling here
	}
	
Example 6: Capturing an existing Open/Authorized transaction

	try {
		bt_stripe.P360_API_v1.Tra t = bt_stripe.P360_API_v1.transactionFactory('0Xxxx0123afg');
		t.capture();
		
		//bt_stripe.P360_API_v1.P360_Exception if something goes wrong with committing records in database
		bt_stripe.P360_API_v1.commitWork();
	} catch (Exception ex) {
		//do error handling here
	}
	
Example 7: Processing multiple transactions

	try {
		bt_stripe.P360_API_v1.PM pm = bt_stripe.P360_API_v1.paymentMethodFactory('0Xxxx0123afg');
		
		bt_stripe.P360_API_v1.Tra t1 = bt_stripe.P360_API_v1.transactionFactory();
		t1.paymentGatewayId = pgList[0].Id;
		t1.pm = pm;
		t1.amount = 110.5;
		t1.capture();
		
		bt_stripe.P360_API_v1.Tra t2 = bt_stripe.P360_API_v1.transactionFactory();
		t2.paymentGatewayId = pgList[0].Id;
		t2.pm = pm;
		t2.amount = 110.5;
		t2.capture();
		
		bt_stripe.P360_API_v1.Tra t3 = bt_stripe.P360_API_v1.transactionFactory();
		t3.paymentGatewayId = pgList[0].Id;
		t3.pm = pm;
		t3.amount = 110.5;
		t3.capture();
		
		//bt_stripe.P360_API_v1.P360_Exception if something goes wrong with committing records in database
		bt_stripe.P360_API_v1.commitWork();
	} catch (Exception ex) {
		//do error handling here
	}
	
Example 7: Refund a transaction

	try {
	    P360_API_v1.Tra t = P360_API_v1.transactionFactory('a0X2xxxxxxxxx477A');
	    t.refund();

	    //bt_stripe.P360_API_v1.P360_Exception if something goes wrong with committing records in database
	    P360_API_v1.commitWork();
	} catch (Exception ex) {
	    // Error handling
	}

Example 8: Partial Refund a transaction

	try {
	    P360_API_v1.Tra t = P360_API_v1.transactionFactory('a0X2xxxxxxxxx477A');
	    t.refund(13); // Pass a valid decimal value that you want to refund

	    //bt_stripe.P360_API_v1.P360_Exception if something goes wrong with committing records in database
	    P360_API_v1.commitWork();
	} catch (Exception ex) {
	    // Error handling
	}

Example 9: Error handling and partial commits

Each `registerCustomer()`, `registerPM()`, `capture()` and `authorize()` call is one webservice callout and is independent of each other. Therefore, its possible to handle errors and perform partial commits to database.

	try {
		bt_stripe.P360_API_v1.PM pm = bt_stripe.P360_API_v1.paymentMethodFactory('0Xxxx0123afg');
		
		try {
			bt_stripe.P360_API_v1.Tra t1 = bt_stripe.P360_API_v1.transactionFactory();
			t1.paymentGatewayId = pgList[0].Id;
			t1.pm = pm;
			t1.amount = 110.5;
			t1.capture();
		} catch (Exception ex) {
			//do error handling here
		}
		
		try {
			bt_stripe.P360_API_v1.Tra t2 = bt_stripe.P360_API_v1.transactionFactory();
			t2.paymentGatewayId = pgList[0].Id;
			t2.pm = pm;
			t2.amount = 110.5;
			t2.capture();
		} catch (Exception ex) {
			//do error handling here
		}
		
		try {
			bt_stripe.P360_API_v1.Tra t3 = bt_stripe.P360_API_v1.transactionFactory();
			t3.paymentGatewayId = pgList[0].Id;
			t3.pm = pm;
			t3.amount = 110.5;
			t3.capture();
		} catch (Exception ex) {
			//do error handling here
		}
		
		//bt_stripe.P360_API_v1.P360_Exception if something goes wrong with committing records in database
		bt_stripe.P360_API_v1.commitWork();
	} catch (Exception ex) {
		//do error handling here
	}
